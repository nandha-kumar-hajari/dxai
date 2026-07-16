import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync, execFileSync } from 'child_process';
import { warnMsg, infoMsg } from './branding.js';
import { buildAgentsMd, buildClaudeMd, buildGeminiMd, buildCursorRule } from './registry/stacks.js';
import { isValidRepo, isValidSkillPath, isSafeId } from './registry/validate.js';
import { writeFileAtomic, writeJsonAtomic } from './fs-atomic.js';
import { fetchText } from './net.js';

const HOME = os.homedir();

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ══════════════════════════════════════════════
// Input substitution
// ══════════════════════════════════════════════
// Resolve a user-provided path: expand ~ and $HOME.
function resolveInputPath(value) {
  if (typeof value !== 'string') return value;
  let v = value.trim();
  if (v === '~' || v.startsWith('~/')) v = path.join(HOME, v.slice(1));
  v = v.replace(/\$HOME\b/g, HOME);
  return v;
}

// Walk a config object (deep) and replace each placeholder string with its resolved value.
function substitutePlaceholders(config, replacements) {
  if (!replacements || Object.keys(replacements).length === 0) return config;

  const replace = (s) => {
    let out = s;
    for (const [placeholder, value] of Object.entries(replacements)) {
      if (typeof out === 'string' && out.includes(placeholder)) {
        out = out.split(placeholder).join(value);
      }
    }
    return out;
  };

  if (typeof config === 'string') return replace(config);
  if (Array.isArray(config)) return config.map((v) => substitutePlaceholders(v, replacements));
  if (config && typeof config === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(config)) out[k] = substitutePlaceholders(v, replacements);
    return out;
  }
  return config;
}

// Build a placeholder→value map for one server entry, given user-provided inputs.
// Inputs is { [serverId]: { [inputKey]: value } }.
function buildReplacements(server, inputs) {
  const out = {};
  if (!server.requiresInput) return out;
  const provided = (inputs && inputs[server.id]) || {};
  for (const [key, def] of Object.entries(server.requiresInput)) {
    if (!def.placeholder) continue;
    const raw = provided[key] ?? def.default ?? '';
    out[def.placeholder] = resolveInputPath(raw);
  }
  return out;
}

// ══════════════════════════════════════════════
// Version pinning
// ══════════════════════════════════════════════
// True for an npm package specifier (optionally scoped); false for paths, URLs, flags.
function isPackageSpec(tok) {
  return /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(tok);
}

// Append `@<version>` to a package specifier unless it already carries a version.
// For scoped names (`@scope/name`) the leading `@` is not a version marker.
function applyVersion(spec, version) {
  const at = spec.lastIndexOf('@');
  const hasVersion = spec.startsWith('@') ? at > 0 : at !== -1;
  return hasVersion ? spec : `${spec}@${version}`;
}

// Pin the package token within an args array. Only tokens after the `npx` anchor
// are considered, so `mcp`/`add`/<id> in a `claude mcp add` command are never touched.
function pinArgs(args, version) {
  const out = [...args];
  const npxIdx = out.indexOf('npx');
  const start = npxIdx === -1 ? 0 : npxIdx + 1;
  for (let i = start; i < out.length; i++) {
    const tok = out[i];
    if (typeof tok !== 'string' || tok.startsWith('-')) continue;
    if (!isPackageSpec(tok)) continue;
    out[i] = applyVersion(tok, version);
    break;
  }
  return out;
}

// Pin the package inside a TOML `args = [...]` block.
function pinTomlPackage(toml, version) {
  return toml.replace(/args\s*=\s*\[([^\]]*)\]/, (_m, inner) => {
    const parts = inner.split(',').map((s) => s.trim());
    for (let i = 0; i < parts.length; i++) {
      const mm = parts[i].match(/^"(.*)"$/);
      if (!mm) continue;
      const tok = mm[1];
      if (tok.startsWith('-') || tok === 'npx' || !isPackageSpec(tok)) continue;
      parts[i] = `"${applyVersion(tok, version)}"`;
      break;
    }
    return `args = [${parts.join(', ')}]`;
  });
}

// Apply a server's pinned `version` to a per-agent config. Handles command/args
// (npx-based stdio servers, incl. `claude mcp add` CLI) and the Codex TOML string.
// No-op for URL/remote configs or when `version` is absent → existing entries unchanged.
export function pinPackageVersion(config, version) {
  if (!version || !config || typeof config !== 'object') return config;
  if (Array.isArray(config.args)) {
    const isNpx = config.command === 'npx' || config.args.includes('npx');
    return isNpx ? { ...config, args: pinArgs(config.args, version) } : config;
  }
  if (typeof config.toml === 'string' && config.toml.includes('npx')) {
    return { ...config, toml: pinTomlPackage(config.toml, version) };
  }
  return config;
}

// ══════════════════════════════════════════════
// Backup helper
// ══════════════════════════════════════════════
function backupFile(filePath) {
  if (fs.existsSync(filePath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = `${filePath}.bak.${ts}`;
    fs.copySync(filePath, backupPath);
    return backupPath;
  }
  return null;
}

// ══════════════════════════════════════════════
// JSON Config Merge (Cursor, VS Code, Gemini, Windsurf)
// ══════════════════════════════════════════════
function mergeJsonMcpConfig(filePath, mcpKey, newServers) {
  const backup = backupFile(filePath);
  if (backup) infoMsg(`Backed up: ${path.basename(filePath)} → ${path.basename(backup)}`);

  let config = {};
  if (fs.existsSync(filePath)) {
    try {
      config = fs.readJsonSync(filePath);
    } catch (err) {
      warnMsg(`Could not parse ${filePath} as JSON (${err.message}). Leaving existing file untouched and aborting merge.`);
      throw new Error(`Refusing to overwrite malformed JSON at ${filePath}`);
    }
  }

  if (!config[mcpKey]) config[mcpKey] = {};

  let added = 0;
  let skipped = 0;
  const addedIds = [];

  for (const [serverId, serverConfig] of Object.entries(newServers)) {
    // Defensive: never let a poisoned registry id (e.g. "__proto__") become a key.
    if (!isSafeId(serverId)) {
      skipped++;
      continue;
    }
    if (config[mcpKey][serverId]) {
      skipped++;
    } else {
      config[mcpKey][serverId] = serverConfig;
      added++;
      addedIds.push(serverId);
    }
  }

  // Atomic write + 0600: configs may carry ${VAR} secret references, and a
  // crash mid-write must never truncate the user's real config.
  writeJsonAtomic(filePath, config, { spaces: 2, mode: 0o600 });

  return { added, skipped, addedIds };
}

// ══════════════════════════════════════════════
// TOML Config Merge (Codex CLI)
// ══════════════════════════════════════════════
function mergeTomlMcpConfig(filePath, newTomlBlocks) {
  const backup = backupFile(filePath);
  if (backup) infoMsg(`Backed up: ${path.basename(filePath)} → ${path.basename(backup)}`);

  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  let added = 0;
  let skipped = 0;
  const addedIds = [];

  for (const { id, toml } of newTomlBlocks) {
    // Already configured? Match the header at the start of a line so a
    // commented-out block (`# [mcp_servers.foo]`) doesn't count as present.
    const headerRe = new RegExp(`^\\s*\\[mcp_servers\\.${escapeRegExp(id)}\\]`, 'm');
    if (headerRe.test(content)) {
      skipped++;
    } else {
      content = content.trimEnd() + '\n\n' + toml + '\n';
      added++;
      addedIds.push(id);
    }
  }

  writeFileAtomic(filePath, content, { mode: 0o600 });

  return { added, skipped, addedIds };
}

// ══════════════════════════════════════════════
// Claude Code CLI Config
// ══════════════════════════════════════════════
function configureClaudeCodeMcp(servers) {
  let added = 0;
  let skipped = 0;
  const errors = [];
  const addedIds = [];

  for (const { id, config } of servers) {
    if (!config.command || config.command !== 'claude') continue;

    try {
      // Check if already configured
      let existing = '';
      try {
        existing = execSync('claude mcp list 2>/dev/null || true', {
          stdio: 'pipe',
          timeout: 10000,
        }).toString();
      } catch {
        // Claude Code might not be running
      }

      if (existing.includes(id)) {
        skipped++;
        continue;
      }

      // Pass argv directly (no shell) so registry-derived args can never be
      // interpreted as shell metacharacters. config.args is already ['mcp','add',…].
      execFileSync('claude', config.args, {
        stdio: 'pipe',
        timeout: 15000,
        env: { ...process.env },
      });
      added++;
      addedIds.push(id);
    } catch (err) {
      errors.push({ id, error: err.message });
    }
  }

  return { added, skipped, errors, addedIds };
}

// ══════════════════════════════════════════════
// Dry-run preview helpers
// ══════════════════════════════════════════════
// Given the same inputs writeMcpConfigs would receive, return a structured
// preview describing exactly what *would* change for each agent: target file
// path, server IDs that would be added, and server IDs that would be skipped
// because they're already present.
export function previewMcpConfigs(selectedAgents, selectedServers, mcpRegistry, inputs = {}) {
  const HOME_DIR = HOME;
  const previews = {};

  for (const agent of selectedAgents) {
    const ap = { agent: agent.name, agentId: agent.id, format: agent.configFormat };

    const serversForAgent = selectedServers
      .map((serverId) => {
        const server = mcpRegistry.find((s) => s.id === serverId);
        if (!server || !server.configs[agent.id]) return null;
        const replacements = buildReplacements(server, inputs);
        const config = substitutePlaceholders(server.configs[agent.id], replacements);
        return { id: serverId, config };
      })
      .filter(Boolean);

    if (serversForAgent.length === 0) {
      previews[agent.id] = { ...ap, path: null, wouldAdd: [], wouldSkip: selectedServers, exists: false };
      continue;
    }

    if (agent.configFormat === 'cli') {
      previews[agent.id] = {
        ...ap,
        path: '<via `claude mcp add`>',
        wouldAdd: serversForAgent.map((s) => s.id),
        wouldSkip: [],
        exists: true,
      };
      continue;
    }

    const filePath = agent.globalMcpPath(HOME_DIR);
    let existing = {};
    let existingToml = '';
    const exists = fs.existsSync(filePath);

    if (exists) {
      if (agent.configFormat === 'json') {
        try { existing = fs.readJsonSync(filePath); } catch { existing = {}; }
      } else if (agent.configFormat === 'toml') {
        existingToml = fs.readFileSync(filePath, 'utf-8');
      }
    }

    const wouldAdd = [];
    const wouldSkip = [];
    for (const { id } of serversForAgent) {
      if (agent.configFormat === 'json') {
        const present = existing[agent.mcpKey] && id in existing[agent.mcpKey];
        if (present) wouldSkip.push(id);
        else wouldAdd.push(id);
      } else if (agent.configFormat === 'toml') {
        if (existingToml.includes(`[mcp_servers.${id}]`)) wouldSkip.push(id);
        else wouldAdd.push(id);
      }
    }

    previews[agent.id] = { ...ap, path: filePath, wouldAdd, wouldSkip, exists };
  }
  return previews;
}

// ══════════════════════════════════════════════
// Main Config Writer — orchestrates per-agent
// ══════════════════════════════════════════════
export function writeMcpConfigs(selectedAgents, selectedServers, mcpRegistry, inputs = {}) {
  const results = {};

  for (const agent of selectedAgents) {
    const agentResult = { agent: agent.name, added: 0, skipped: 0, errors: [] };

    // Build the server configs for this agent
    const serversForAgent = selectedServers
      .map((serverId) => {
        const server = mcpRegistry.find((s) => s.id === serverId);
        if (!server || !server.configs[agent.id]) return null;
        const replacements = buildReplacements(server, inputs);
        let config = substitutePlaceholders(server.configs[agent.id], replacements);
        if (server.version) config = pinPackageVersion(config, server.version);
        return { id: serverId, config };
      })
      .filter(Boolean);

    if (serversForAgent.length === 0) {
      agentResult.skipped = selectedServers.length;
      agentResult.addedIds = [];
      results[agent.id] = agentResult;
      continue;
    }

    try {
      switch (agent.configFormat) {
        case 'json': {
          // Build JSON server map
          const serverMap = {};
          for (const { id, config } of serversForAgent) {
            serverMap[id] = config;
          }
          const configPath = agent.globalMcpPath(HOME);
          const { added, skipped, addedIds } = mergeJsonMcpConfig(configPath, agent.mcpKey, serverMap);
          agentResult.added = added;
          agentResult.skipped = skipped;
          agentResult.addedIds = addedIds;
          agentResult.path = configPath;
          break;
        }

        case 'toml': {
          // Build TOML blocks
          const tomlBlocks = serversForAgent
            .filter(({ config }) => config.toml)
            .map(({ id, config }) => ({ id, toml: config.toml }));
          const configPath = agent.globalMcpPath(HOME);
          const { added, skipped, addedIds } = mergeTomlMcpConfig(configPath, tomlBlocks);
          agentResult.added = added;
          agentResult.skipped = skipped;
          agentResult.addedIds = addedIds;
          agentResult.path = configPath;
          break;
        }

        case 'cli': {
          // Claude Code uses CLI commands
          const { added, skipped, errors, addedIds } = configureClaudeCodeMcp(serversForAgent);
          agentResult.added = added;
          agentResult.skipped = skipped;
          agentResult.addedIds = addedIds;
          agentResult.errors = errors;
          break;
        }
      }
    } catch (err) {
      agentResult.errors.push({ id: 'general', error: err.message });
    }

    results[agent.id] = agentResult;
  }

  return results;
}

// ══════════════════════════════════════════════
// Cursor Rules Writer
// ══════════════════════════════════════════════
export function writeCursorRules(selectedStacks, rulesMap, profile = null) {
  const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
  fs.ensureDirSync(rulesDir);

  const written = [];

  // Always write general rules (with optional profile injection)
  if (rulesMap.general) {
    const filePath = path.join(rulesDir, 'general.mdc');
    if (!fs.existsSync(filePath)) {
      const content = buildCursorRule('general', profile) || rulesMap.general;
      fs.writeFileSync(filePath, content, 'utf-8');
      written.push('general.mdc');
    }
  }

  // Write stack-specific rules
  for (const stackId of selectedStacks) {
    if (rulesMap[stackId]) {
      const filePath = path.join(rulesDir, `${stackId}.mdc`);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, rulesMap[stackId], 'utf-8');
        written.push(`${stackId}.mdc`);
      }
    }
  }

  return written;
}

// ══════════════════════════════════════════════
// Cursor Commands Writer
// ══════════════════════════════════════════════
export function writeCursorCommands(commandsMap) {
  const commandsDir = path.join(process.cwd(), '.cursor', 'commands');
  fs.ensureDirSync(commandsDir);

  const written = [];

  for (const [name, content] of Object.entries(commandsMap)) {
    const filePath = path.join(commandsDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      written.push(`${name}.md`);
    }
  }

  return written;
}

// ══════════════════════════════════════════════
// Cursorignore Writer
// ══════════════════════════════════════════════
export function writeCursorIgnore() {
  const CURSORIGNORE_CONTENT = `# Dependencies
node_modules/
.pnp/
.pnp.js

# Build outputs
dist/
build/
.next/
out/
__pycache__/
*.pyc

# Environment
.env
.env.local
.env.production

# IDE
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Package locks (reduce noise)
package-lock.json
yarn.lock
pnpm-lock.yaml
`;

  const filePath = path.join(process.cwd(), '.cursorignore');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, CURSORIGNORE_CONTENT, 'utf-8');
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════
// CLAUDE.md / GEMINI.md Writer
// ══════════════════════════════════════════════
export function writeProjectInstructions(selectedAgents, selectedStacks, profile = null) {
  const written = [];

  const hasClaudeCode = selectedAgents.some((a) => a.id === 'claude-code');
  const hasGemini = selectedAgents.some((a) => a.id === 'gemini');

  if (hasClaudeCode) {
    const filePath = path.join(process.cwd(), 'CLAUDE.md');
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buildClaudeMd(selectedStacks, profile), 'utf-8');
      written.push('CLAUDE.md');
    }
  }

  if (hasGemini) {
    const filePath = path.join(process.cwd(), 'GEMINI.md');
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buildGeminiMd(selectedStacks, profile), 'utf-8');
      written.push('GEMINI.md');
    }
  }

  return written;
}

// ══════════════════════════════════════════════
// Project-Level MCP Config Writer
// ══════════════════════════════════════════════
export function writeProjectMcpConfigs(agentsWithProjectMcp, selectedServers, mcpRegistry, inputs = {}) {
  const results = {};

  for (const agent of agentsWithProjectMcp) {
    const agentResult = { agent: agent.name, added: 0, skipped: 0, errors: [] };

    const serversForAgent = selectedServers
      .map((serverId) => {
        const server = mcpRegistry.find((s) => s.id === serverId);
        if (!server || !server.configs[agent.id]) return null;
        const replacements = buildReplacements(server, inputs);
        let config = substitutePlaceholders(server.configs[agent.id], replacements);
        if (server.version) config = pinPackageVersion(config, server.version);
        return { id: serverId, config };
      })
      .filter(Boolean);

    if (serversForAgent.length === 0) {
      agentResult.skipped = selectedServers.length;
      agentResult.addedIds = [];
      results[agent.id] = agentResult;
      continue;
    }

    try {
      const serverMap = {};
      for (const { id, config } of serversForAgent) {
        serverMap[id] = config;
      }
      const configPath = path.join(process.cwd(), agent.projectMcpPath());
      const { added, skipped, addedIds } = mergeJsonMcpConfig(configPath, agent.mcpKey, serverMap);
      agentResult.added = added;
      agentResult.skipped = skipped;
      agentResult.addedIds = addedIds;
      agentResult.path = configPath;
    } catch (err) {
      agentResult.errors.push({ id: 'general', error: err.message });
    }

    results[agent.id] = agentResult;
  }

  return results;
}

// ══════════════════════════════════════════════
// .gitattributes Writer
// ══════════════════════════════════════════════
export function writeGitattributes() {
  const GITATTRIBUTES_CONTENT = `# Auto detect text files and ensure LF line endings
* text=auto eol=lf

# Denote generated files that AI agents can skip
# (linguist-generated suppresses them from diffs/stats)
package-lock.json linguist-generated=true
yarn.lock         linguist-generated=true
pnpm-lock.yaml    linguist-generated=true
bun.lockb         linguist-generated=true binary

# Diff drivers for common formats
*.md   diff=markdown
*.css  diff=css
*.html diff=html

# Binary files — don't diff or merge
*.png  binary
*.jpg  binary
*.jpeg binary
*.gif  binary
*.ico  binary
*.woff binary
*.woff2 binary
*.ttf  binary
*.eot  binary
*.pdf  binary
*.zip  binary
*.gz   binary
*.tar  binary

# Merge strategies — keep ours for lock files during rebases
package-lock.json merge=ours
yarn.lock         merge=ours
pnpm-lock.yaml    merge=ours
`;

  const filePath = path.join(process.cwd(), '.gitattributes');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, GITATTRIBUTES_CONTENT, 'utf-8');
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════
// .editorconfig Writer
// ══════════════════════════════════════════════
export function writeEditorconfig() {
  const EDITORCONFIG_CONTENT = `# EditorConfig — consistent formatting across editors and AI agents
# https://editorconfig.org

root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.py]
indent_size = 4

[*.go]
indent_style = tab

[*.rs]
indent_size = 4

[Makefile]
indent_style = tab
`;

  const filePath = path.join(process.cwd(), '.editorconfig');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, EDITORCONFIG_CONTENT, 'utf-8');
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════
// AGENTS.md Writer
// ══════════════════════════════════════════════
export function writeAgentsMd(selectedStacks, profile = null) {
  const filePath = path.join(process.cwd(), 'AGENTS.md');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, buildAgentsMd(selectedStacks, profile), 'utf-8');
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════
// Skills Installer
// ══════════════════════════════════════════════
export async function installSkills(selectedSkills, skillRegistry, selectedAgents) {
  const installed = [];
  const errors = [];

  // Determine target directory.
  // `.agents/skills` is OpenAI Codex CLI's native repository-level skills path
  // (Codex scans it from cwd up to the repo root) and is the cross-tool
  // convention, so we prefer it whenever Codex is among the selected agents —
  // even alongside Cursor — so Codex discovers the skills without extra config.
  // Cursor's own location (`.cursor/skills`) is used only when Cursor is
  // selected and Codex is not.
  const hasCodex = selectedAgents.some((a) => a.id === 'codex');
  const hasCursor = selectedAgents.some((a) => a.id === 'cursor');
  const skillsBaseDir = (hasCursor && !hasCodex)
    ? path.join(process.cwd(), '.cursor', 'skills')
    : path.join(process.cwd(), '.agents', 'skills');

  fs.ensureDirSync(skillsBaseDir);

  // A skill counts as installed only once its SKILL.md is actually on disk —
  // never trust an installer's exit code alone.
  const hasSkillContent = (dir) => fs.existsSync(path.join(dir, 'SKILL.md'));

  for (const skillId of selectedSkills) {
    const skill = skillRegistry.find((s) => s.id === skillId);
    if (!skill) continue;

    // Registry data is untrusted (network-fetched). `repo`/`path` are
    // interpolated into URLs and command arguments below, so reject anything
    // that isn't a clean "owner/name" + safe sub-path before going further.
    if (!isSafeId(skillId) || !isValidRepo(skill.repo) || !isValidSkillPath(skill.path)) {
      errors.push({ name: skill.name, error: 'invalid skill repo/path in registry' });
      continue;
    }

    const targetDir = path.join(skillsBaseDir, skillId);
    if (hasSkillContent(targetDir)) {
      infoMsg(`Skill "${skill.name}" already installed, skipping`);
      continue;
    }
    // A leftover empty dir from a previous failed run would otherwise block a
    // retry — clear it so we can reinstall cleanly.
    if (fs.existsSync(targetDir)) fs.removeSync(targetDir);

    try {
      const repoUrl = `https://github.com/${skill.repo}`;
      const clonePath = skill.path === '.' ? '' : `/${skill.path}`;

      // Try npx skills first. It clones the (often large) source repo, so allow
      // a generous timeout, and verify SKILL.md landed before claiming success —
      // a 0 exit code with no files written must NOT be reported as installed.
      // execFileSync (argv form, no shell) so registry-derived URL segments can
      // never be interpreted as shell metacharacters.
      try {
        execFileSync(
          'npx',
          ['-y', 'skills', 'install', `${repoUrl}/tree/main${clonePath}`, '--dir', skillsBaseDir],
          { stdio: 'pipe', timeout: 180000 }
        );
        if (hasSkillContent(targetDir)) {
          installed.push(skill.name);
          continue;
        }
      } catch {
        // Fall back to manual download
      }

      // Manual: create skill dir and fetch SKILL.md with native fetch (no shell,
      // no curl dependency). `rawUrl` is a fixed https raw.githubusercontent.com
      // URL; repo/path were validated above. A 404 (or other non-2xx) rejects,
      // so it lands in the catch rather than writing an error page to disk.
      fs.ensureDirSync(targetDir);
      const rawUrl = `https://raw.githubusercontent.com/${skill.repo}/main/${skill.path === '.' ? '' : skill.path + '/'}SKILL.md`;
      try {
        const content = await fetchText(rawUrl, { timeoutMs: 15000 });
        if (content && content.length > 50) {
          fs.writeFileSync(path.join(targetDir, 'SKILL.md'), content, 'utf-8');
          installed.push(skill.name);
        } else {
          fs.removeSync(targetDir);
          errors.push({ name: skill.name, error: 'SKILL.md not found at source' });
        }
      } catch (err) {
        fs.removeSync(targetDir);
        errors.push({ name: skill.name, error: err.message });
      }
    } catch (err) {
      errors.push({ name: skill.name, error: err.message });
    }
  }

  return { installed, errors, directory: skillsBaseDir };
}
