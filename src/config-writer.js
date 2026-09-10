import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { warnMsg, infoMsg } from './branding.js';
import { buildAgentsMd, buildClaudeMd, buildGeminiMd, buildCursorRule } from './registry/stacks.js';
import { isValidRepo, isValidSkillPath, isSafeId } from './registry/validate.js';
import { listClaudeCodeMcpOutput, outputHasServerId } from './config-remover.js';
import { writeFileAtomic, writeJsonAtomic } from './fs-atomic.js';
import { fetchText } from './net.js';

const HOME = os.homedir();

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Input substitution ──
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

// ── Version pinning ──
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

// ── Backup helper ──
// How many `.bak.<ts>` snapshots to keep per file. Older ones are pruned on
// each new backup so repeated runs can't accumulate snapshots forever.
const MAX_BACKUPS_PER_FILE = 5;

function pruneOldBackups(filePath) {
  const dir = path.dirname(filePath);
  const prefix = `${path.basename(filePath)}.bak.`;
  let siblings;
  try {
    siblings = fs.readdirSync(dir).filter((f) => f.startsWith(prefix));
  } catch {
    return;
  }
  // Timestamp suffixes sort lexicographically == chronologically.
  siblings.sort().reverse();
  for (const stale of siblings.slice(MAX_BACKUPS_PER_FILE)) {
    try { fs.removeSync(path.join(dir, stale)); } catch { /* best-effort */ }
  }
}

function backupFile(filePath) {
  if (fs.existsSync(filePath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = `${filePath}.bak.${ts}`;
    fs.copySync(filePath, backupPath);
    pruneOldBackups(filePath);
    return backupPath;
  }
  return null;
}

// ── JSON Config Merge (Cursor, VS Code, Gemini, Windsurf) ──
function mergeJsonMcpConfig(filePath, mcpKey, newServers) {
  let config = {};
  if (fs.existsSync(filePath)) {
    try {
      config = fs.readJsonSync(filePath);
    } catch (err) {
      warnMsg(`Could not parse ${filePath} as JSON (${err.message}). Note: JSON with comments (JSONC) is not supported. Leaving existing file untouched and aborting merge.`);
      throw new Error(`Refusing to overwrite malformed JSON at ${filePath}`, { cause: err });
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

  // Nothing to change → don't touch the file (and don't mint a pointless backup).
  if (added === 0) return { added, skipped, addedIds };

  const backup = backupFile(filePath);
  if (backup) infoMsg(`Backed up: ${path.basename(filePath)} → ${path.basename(backup)}`);

  // Atomic write + 0600: configs may carry ${VAR} secret references, and a
  // crash mid-write must never truncate the user's real config.
  writeJsonAtomic(filePath, config, { spaces: 2, mode: 0o600 });

  return { added, skipped, addedIds };
}

// ── TOML Config Merge (Codex CLI) ──
// NOTE: Codex TOML is handled by line-anchored string surgery, not a TOML
// parser — deliberately, so user comments and formatting survive our edits.
// Supported grammar: the `[mcp_servers.<id>]` blocks dxai itself generates
// (single-line `key = value` pairs, single-line arrays). Hand-written exotic
// TOML (multi-line arrays, dotted headers inside strings) is out of scope.
function mergeTomlMcpConfig(filePath, newTomlBlocks) {
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

  // Nothing to change → don't touch the file (and don't mint a pointless backup).
  if (added === 0) return { added, skipped, addedIds };

  const backup = backupFile(filePath);
  if (backup) infoMsg(`Backed up: ${path.basename(filePath)} → ${path.basename(backup)}`);

  writeFileAtomic(filePath, content, { mode: 0o600 });

  return { added, skipped, addedIds };
}

// ── Claude Code CLI Config ──
// Claude Code expands no variables at user scope, so `--env VAR=${VAR}` pairs are
// resolved from dxai's own environment here; pairs whose variable is unset are
// dropped (the needs-env summary tells the user what to export and re-run).
export function resolveClaudeEnvArgs(args, env = process.env) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && i + 1 < args.length) {
      const m = /^([A-Z_][A-Z0-9_]*)=\$\{([A-Z_][A-Z0-9_]*)\}$/.exec(args[i + 1]);
      if (m) {
        if (env[m[2]] !== undefined) out.push('--env', `${m[1]}=${env[m[2]]}`);
        i++;
        continue;
      }
    }
    out.push(args[i]);
  }
  return out;
}

function configureClaudeCodeMcp(servers) {
  let added = 0;
  let skipped = 0;
  const errors = [];
  const addedIds = [];

  // One list call for the whole batch — token-boundary matched per id so
  // e.g. "git" can never be mistaken for an already-configured "github".
  const existing = listClaudeCodeMcpOutput();

  for (const { id, config } of servers) {
    if (!config.command || config.command !== 'claude') continue;

    try {
      if (outputHasServerId(existing, id)) {
        skipped++;
        continue;
      }

      // Pass argv directly (no shell) so registry-derived args can never be
      // interpreted as shell metacharacters. config.args is already ['mcp','add',…].
      execFileSync('claude', resolveClaudeEnvArgs(config.args), {
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

// ── Dry-run preview helpers ──
// Given the same inputs writeMcpConfigs would receive, return a structured
// preview describing exactly what *would* change for each agent: target file
// path, server IDs that would be added, and server IDs that would be skipped
// because they're already present.
export function previewMcpConfigs(selectedAgents, selectedServers, mcpRegistry, inputs = {}) {
  const previews = {};

  for (const agent of selectedAgents) {
    const ap = { agent: agent.name, agentId: agent.id, format: agent.configFormat };
    const serversForAgent = resolveServersForAgent(agent, selectedServers, mcpRegistry, inputs);

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

    const filePath = agent.globalMcpPath(HOME);
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

// ── Main Config Writer — orchestrates per-agent ──

// The per-server configs to write for one agent: registry lookup, placeholder
// substitution, and version pinning. Servers with no config for this agent are
// dropped. Shared by the global, project, and dry-run preview paths so they can
// never disagree about what a server looks like.
// Agents whose config file has no documented variable interpolation get the
// real value from dxai's own environment at write time; unset variables keep the
// ${VAR} placeholder so the user can see what to fill in.
function substituteEnvLiterals(config) {
  if (typeof config === 'string') {
    return config.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (m, name) => (process.env[name] !== undefined ? process.env[name] : m));
  }
  if (Array.isArray(config)) return config.map(substituteEnvLiterals);
  if (config && typeof config === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(config)) out[k] = substituteEnvLiterals(v);
    return out;
  }
  return config;
}

function resolveServersForAgent(agent, selectedServers, mcpRegistry, inputs, { project = false } = {}) {
  const dialect = project ? (agent.projectMcpDialect || agent.mcpDialect) : agent.mcpDialect;
  const out = [];
  for (const serverId of selectedServers) {
    const server = mcpRegistry.find((s) => s.id === serverId);
    const block = project ? server?.projectConfigs?.[agent.id] : server?.configs?.[agent.id];
    if (!server || !block) continue;
    let config = substitutePlaceholders(block, buildReplacements(server, inputs));
    if (server.version) config = pinPackageVersion(config, server.version);
    if (dialect?.envRef === 'literal') config = substituteEnvLiterals(config);
    out.push({ id: serverId, config });
  }
  return out;
}

function toServerMap(serversForAgent) {
  const map = {};
  for (const { id, config } of serversForAgent) map[id] = config;
  return map;
}

export function writeMcpConfigs(selectedAgents, selectedServers, mcpRegistry, inputs = {}) {
  const results = {};

  for (const agent of selectedAgents) {
    const agentResult = { agent: agent.name, added: 0, skipped: 0, errors: [], addedIds: [] };
    const serversForAgent = resolveServersForAgent(agent, selectedServers, mcpRegistry, inputs);

    if (serversForAgent.length === 0) {
      agentResult.skipped = selectedServers.length;
      results[agent.id] = agentResult;
      continue;
    }

    try {
      switch (agent.configFormat) {
        case 'json': {
          const configPath = agent.globalMcpPath(HOME);
          const merged = mergeJsonMcpConfig(configPath, agent.mcpKey, toServerMap(serversForAgent));
          Object.assign(agentResult, merged, { path: configPath });
          break;
        }

        case 'toml': {
          const tomlBlocks = serversForAgent
            .filter(({ config }) => config.toml)
            .map(({ id, config }) => ({ id, toml: config.toml }));
          const configPath = agent.globalMcpPath(HOME);
          const merged = mergeTomlMcpConfig(configPath, tomlBlocks);
          Object.assign(agentResult, merged, { path: configPath });
          break;
        }

        case 'cli': {
          Object.assign(agentResult, configureClaudeCodeMcp(serversForAgent));
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

// ── Cursor Rules Writer ──
export function writeCursorRules(selectedStacks, rulesMap, profile = null) {
  const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
  fs.ensureDirSync(rulesDir);

  const written = [];

  // General rules always, with project context injected when a profile is known.
  if (rulesMap.general) {
    const content = buildCursorRule('general', profile) || rulesMap.general;
    if (writeIfAbsent(path.join(rulesDir, 'general.mdc'), content)) written.push('general.mdc');
  }

  for (const stackId of selectedStacks) {
    if (!rulesMap[stackId]) continue;
    if (writeIfAbsent(path.join(rulesDir, `${stackId}.mdc`), rulesMap[stackId])) written.push(`${stackId}.mdc`);
  }

  return written;
}

// ── Cursor Commands Writer ──
// Cursor retired `.cursor/commands/*.md` in favour of skills: a slash command is
// now `.cursor/skills/<name>/SKILL.md` with `disable-model-invocation: true`
// (see https://cursor.com/help/customization/skills). Returns the relative
// paths written, under `.cursor/skills/`.
export function commandAsSkill(name, body) {
  const title = body.split('\n').find((l) => l.startsWith('# '))?.replace(/^#\s+/, '').trim() || name;
  return [
    '---',
    `name: ${name}`,
    `description: ${title}. Invoke with /${name}.`,
    'disable-model-invocation: true',
    '---',
    '',
    body.trimEnd(),
    '',
  ].join('\n');
}

export function writeCursorCommands(commandsMap) {
  const skillsDir = path.join(process.cwd(), '.cursor', 'skills');
  const written = [];

  for (const [name, content] of Object.entries(commandsMap)) {
    const target = path.join(skillsDir, name, 'SKILL.md');
    if (fs.existsSync(target)) continue;
    fs.ensureDirSync(path.dirname(target));
    if (writeIfAbsent(target, commandAsSkill(name, content))) written.push(path.join(name, 'SKILL.md'));
  }

  return written;
}

// ── Static project files ──
// Written only when absent; never overwrite a file the user may have edited.
function writeIfAbsent(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

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

export function writeCursorIgnore() {
  return writeIfAbsent(path.join(process.cwd(), '.cursorignore'), CURSORIGNORE_CONTENT);
}

export function writeGitattributes() {
  return writeIfAbsent(path.join(process.cwd(), '.gitattributes'), GITATTRIBUTES_CONTENT);
}

export function writeEditorconfig() {
  return writeIfAbsent(path.join(process.cwd(), '.editorconfig'), EDITORCONFIG_CONTENT);
}

export function writeAgentsMd(selectedStacks, profile = null) {
  return writeIfAbsent(path.join(process.cwd(), 'AGENTS.md'), buildAgentsMd(selectedStacks, profile));
}

// ── CLAUDE.md / GEMINI.md Writer ──
export function writeProjectInstructions(selectedAgents, selectedStacks, profile = null, { importAgentsMd = false } = {}) {
  const written = [];

  const hasClaudeCode = selectedAgents.some((a) => a.id === 'claude-code');
  const hasGemini = selectedAgents.some((a) => a.id === 'gemini');

  if (hasClaudeCode && writeIfAbsent(path.join(process.cwd(), 'CLAUDE.md'), buildClaudeMd(selectedStacks, profile, { importAgentsMd }))) {
    written.push('CLAUDE.md');
  }
  if (hasGemini && writeIfAbsent(path.join(process.cwd(), 'GEMINI.md'), buildGeminiMd(selectedStacks, profile))) {
    written.push('GEMINI.md');
  }

  return written;
}

// ── Project-Level MCP Config Writer ──
export function writeProjectMcpConfigs(agentsWithProjectMcp, selectedServers, mcpRegistry, inputs = {}) {
  const results = {};

  for (const agent of agentsWithProjectMcp) {
    const agentResult = { agent: agent.name, added: 0, skipped: 0, errors: [], addedIds: [] };
    const serversForAgent = resolveServersForAgent(agent, selectedServers, mcpRegistry, inputs, { project: true });

    if (serversForAgent.length === 0) {
      agentResult.skipped = selectedServers.length;
      results[agent.id] = agentResult;
      continue;
    }

    try {
      const configPath = path.join(process.cwd(), agent.projectMcpPath());
      const format = agent.projectConfigFormat || agent.configFormat;
      const merged = format === 'toml'
        ? mergeTomlMcpConfig(configPath, serversForAgent.filter(({ config }) => config.toml).map(({ id, config }) => ({ id, toml: config.toml })))
        : mergeJsonMcpConfig(configPath, agent.projectMcpKey || agent.mcpKey, toServerMap(serversForAgent));
      Object.assign(agentResult, merged, { path: configPath });
    } catch (err) {
      agentResult.errors.push({ id: 'general', error: err.message });
    }

    results[agent.id] = agentResult;
  }

  return results;
}

// ── Skills Installer ──
// Download a skill's SKILL.md from its raw GitHub URL. Returns the markdown text.
// A non-2xx (e.g. a missing file → 404) rejects inside fetchText, and an empty
// body is treated as "not found" — so a failed download never writes a bogus
// SKILL.md to disk. `fetchImpl` is injectable so the fetch path is testable
// without a network. `skill.repo`/`skill.path` must be validated by the caller.
export async function downloadSkillMarkdown(skill, { fetchImpl = fetchText, timeoutMs = 15000 } = {}) {
  const rawUrl = `https://raw.githubusercontent.com/${skill.repo}/main/${skill.path === '.' ? '' : skill.path + '/'}SKILL.md`;
  const content = await fetchImpl(rawUrl, { timeoutMs });
  if (!content || content.trim().length === 0) {
    throw new Error('SKILL.md not found at source');
  }
  return content;
}

export async function installSkills(selectedSkills, skillRegistry, selectedAgents) {
  const installed = [];
  const errors = [];

  // Target directories. `.agents/skills` is the cross-tool convention read
  // natively by Codex, Cursor, Devin and Antigravity, so it is always the
  // primary location. Claude Code only discovers `.claude/skills`, so when it is
  // selected each skill is mirrored there as well.
  const skillsBaseDir = path.join(process.cwd(), '.agents', 'skills');
  const extraDirs = selectedAgents.some((a) => a.id === 'claude-code')
    ? [path.join(process.cwd(), '.claude', 'skills')]
    : [];

  fs.ensureDirSync(skillsBaseDir);

  const mirror = (skillId) => {
    for (const dir of extraDirs) {
      const dest = path.join(dir, skillId);
      if (!fs.existsSync(path.join(dest, 'SKILL.md'))) fs.copySync(path.join(skillsBaseDir, skillId), dest);
    }
  };

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
      errors.push({ id: skillId, name: skill.name, error: 'invalid skill repo/path in registry' });
      continue;
    }

    const targetDir = path.join(skillsBaseDir, skillId);
    if (hasSkillContent(targetDir)) {
      mirror(skillId);
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
          mirror(skillId);
          installed.push(skillId);
          continue;
        }
      } catch {
        // Fall back to manual download
      }

      // Manual fallback: create the skill dir and fetch SKILL.md with native
      // fetch (no shell, no curl dependency). A 404/empty body throws, so it
      // lands in the catch and the dir is cleaned up rather than left holding a
      // bogus file. repo/path were validated above.
      fs.ensureDirSync(targetDir);
      try {
        const content = await downloadSkillMarkdown(skill);
        fs.writeFileSync(path.join(targetDir, 'SKILL.md'), content, 'utf-8');
        mirror(skillId);
        installed.push(skillId);
      } catch (err) {
        fs.removeSync(targetDir);
        errors.push({ id: skillId, name: skill.name, error: err.message });
      }
    } catch (err) {
      errors.push({ id: skillId, name: skill.name, error: err.message });
    }
  }

  return { installed, errors, directory: skillsBaseDir, extraDirectories: extraDirs };
}
