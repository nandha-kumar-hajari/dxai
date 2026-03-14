import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { successMsg, warnMsg, errorMsg, infoMsg, theme } from './branding.js';

const HOME = os.homedir();

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
    } catch {
      config = {};
    }
  }

  if (!config[mcpKey]) config[mcpKey] = {};

  let added = 0;
  let skipped = 0;

  for (const [serverId, serverConfig] of Object.entries(newServers)) {
    if (config[mcpKey][serverId]) {
      skipped++;
    } else {
      config[mcpKey][serverId] = serverConfig;
      added++;
    }
  }

  fs.ensureDirSync(path.dirname(filePath));
  fs.writeJsonSync(filePath, config, { spaces: 2 });

  return { added, skipped };
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

  for (const { id, toml } of newTomlBlocks) {
    // Check if server already configured
    if (content.includes(`[mcp_servers.${id}]`)) {
      skipped++;
    } else {
      content = content.trimEnd() + '\n\n' + toml + '\n';
      added++;
    }
  }

  fs.ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');

  return { added, skipped };
}

// ══════════════════════════════════════════════
// Claude Code CLI Config
// ══════════════════════════════════════════════
function configureClaudeCodeMcp(servers) {
  let added = 0;
  let skipped = 0;
  const errors = [];

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

      const args = config.args.join(' ');
      execSync(`claude ${args}`, {
        stdio: 'pipe',
        timeout: 15000,
        env: { ...process.env },
      });
      added++;
    } catch (err) {
      errors.push({ id, error: err.message });
    }
  }

  return { added, skipped, errors };
}

// ══════════════════════════════════════════════
// Main Config Writer — orchestrates per-agent
// ══════════════════════════════════════════════
export function writeMcpConfigs(selectedAgents, selectedServers, mcpRegistry) {
  const results = {};

  for (const agent of selectedAgents) {
    const agentResult = { agent: agent.name, added: 0, skipped: 0, errors: [] };

    // Build the server configs for this agent
    const serversForAgent = selectedServers
      .map((serverId) => {
        const server = mcpRegistry.find((s) => s.id === serverId);
        if (!server || !server.configs[agent.id]) return null;
        return { id: serverId, config: server.configs[agent.id], meta: server };
      })
      .filter(Boolean);

    if (serversForAgent.length === 0) {
      agentResult.skipped = selectedServers.length;
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
          const { added, skipped } = mergeJsonMcpConfig(configPath, agent.mcpKey, serverMap);
          agentResult.added = added;
          agentResult.skipped = skipped;
          agentResult.path = configPath;
          break;
        }

        case 'toml': {
          // Build TOML blocks
          const tomlBlocks = serversForAgent
            .filter(({ config }) => config.toml)
            .map(({ id, config }) => ({ id, toml: config.toml }));
          const configPath = agent.globalMcpPath(HOME);
          const { added, skipped } = mergeTomlMcpConfig(configPath, tomlBlocks);
          agentResult.added = added;
          agentResult.skipped = skipped;
          agentResult.path = configPath;
          break;
        }

        case 'cli': {
          // Claude Code uses CLI commands
          const { added, skipped, errors } = configureClaudeCodeMcp(serversForAgent);
          agentResult.added = added;
          agentResult.skipped = skipped;
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
export function writeCursorRules(selectedStacks, rulesMap) {
  const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
  fs.ensureDirSync(rulesDir);

  const written = [];

  // Always write general rules
  if (rulesMap.general) {
    const filePath = path.join(rulesDir, 'general.mdc');
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, rulesMap.general, 'utf-8');
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
export function writeProjectInstructions(selectedAgents, selectedStacks, templates) {
  const stackDesc = selectedStacks.join(', ');
  const written = [];

  const hasClaudeCode = selectedAgents.some((a) => a.id === 'claude-code');
  const hasGemini = selectedAgents.some((a) => a.id === 'gemini');

  if (hasClaudeCode) {
    const filePath = path.join(process.cwd(), 'CLAUDE.md');
    if (!fs.existsSync(filePath)) {
      const content = templates.claudeMd.replace('{{STACK_DESCRIPTION}}', stackDesc);
      fs.writeFileSync(filePath, content, 'utf-8');
      written.push('CLAUDE.md');
    }
  }

  if (hasGemini) {
    const filePath = path.join(process.cwd(), 'GEMINI.md');
    if (!fs.existsSync(filePath)) {
      const content = templates.geminiMd.replace('{{STACK_DESCRIPTION}}', stackDesc);
      fs.writeFileSync(filePath, content, 'utf-8');
      written.push('GEMINI.md');
    }
  }

  return written;
}

// ══════════════════════════════════════════════
// Project-Level MCP Config Writer
// ══════════════════════════════════════════════
export function writeProjectMcpConfigs(agentsWithProjectMcp, selectedServers, mcpRegistry) {
  const results = {};

  for (const agent of agentsWithProjectMcp) {
    const agentResult = { agent: agent.name, added: 0, skipped: 0, errors: [] };

    const serversForAgent = selectedServers
      .map((serverId) => {
        const server = mcpRegistry.find((s) => s.id === serverId);
        if (!server || !server.configs[agent.id]) return null;
        return { id: serverId, config: server.configs[agent.id], meta: server };
      })
      .filter(Boolean);

    if (serversForAgent.length === 0) {
      agentResult.skipped = selectedServers.length;
      results[agent.id] = agentResult;
      continue;
    }

    try {
      const serverMap = {};
      for (const { id, config } of serversForAgent) {
        serverMap[id] = config;
      }
      const configPath = path.join(process.cwd(), agent.projectMcpPath());
      const { added, skipped } = mergeJsonMcpConfig(configPath, agent.mcpKey, serverMap);
      agentResult.added = added;
      agentResult.skipped = skipped;
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
export function writeAgentsMd(selectedStacks) {
  const stackDesc = selectedStacks.join(', ');

  const AGENTS_MD_CONTENT = `# AGENTS.md — Project Context for AI Agents

> This file provides context for AI coding agents working in this repository.
> Fill in the sections below so any agent (Claude Code, Cursor, Copilot, Codex, Gemini, etc.)
> can understand your project quickly.

## Project Overview

<!-- What does this project do? Who is it for? -->

## Tech Stack

${stackDesc}

## Architecture

<!-- High-level description of the codebase structure -->
<!--
- src/           — application source code
- tests/         — test files
- scripts/       — build/deploy scripts
- docs/          — documentation
-->

## Key Commands

\`\`\`bash
# Install dependencies
# npm install

# Run development server
# npm run dev

# Run tests
# npm test

# Build for production
# npm run build

# Lint / format
# npm run lint
\`\`\`

## Conventions

- <!-- e.g. "We use conventional commits (feat:, fix:, chore:)" -->
- <!-- e.g. "All new code must have tests" -->
- <!-- e.g. "Use Zod for runtime validation at API boundaries" -->

## Gotchas

- <!-- e.g. "The auth module uses a custom session store — don't replace with express-session" -->
- <!-- e.g. "Tests require a running Postgres instance (see docker-compose.yml)" -->

## Environment Variables

<!-- List required env vars and where to get them -->
<!--
- DATABASE_URL — Postgres connection string
- API_KEY — from the internal dashboard
-->
`;

  const filePath = path.join(process.cwd(), 'AGENTS.md');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, AGENTS_MD_CONTENT, 'utf-8');
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════
// Skills Installer
// ══════════════════════════════════════════════
export function installSkills(selectedSkills, skillRegistry, selectedAgents) {
  const installed = [];
  const errors = [];

  // Determine target directory
  // Use .cursor/skills if Cursor selected, else .agents/skills
  const hasCursor = selectedAgents.some((a) => a.id === 'cursor');
  const skillsBaseDir = hasCursor
    ? path.join(process.cwd(), '.cursor', 'skills')
    : path.join(process.cwd(), '.agents', 'skills');

  fs.ensureDirSync(skillsBaseDir);

  for (const skillId of selectedSkills) {
    const skill = skillRegistry.find((s) => s.id === skillId);
    if (!skill) continue;

    const targetDir = path.join(skillsBaseDir, skillId);
    if (fs.existsSync(targetDir)) {
      infoMsg(`Skill "${skill.name}" already installed, skipping`);
      continue;
    }

    try {
      // Use npx skills or git clone
      const repoUrl = `https://github.com/${skill.repo}`;
      const clonePath = skill.path === '.' ? '' : `/${skill.path}`;

      // Try npx skills first
      try {
        execSync(
          `npx -y skills install ${repoUrl}/tree/main${clonePath} --dir "${skillsBaseDir}" 2>/dev/null`,
          { stdio: 'pipe', timeout: 30000 }
        );
        installed.push(skill.name);
        continue;
      } catch {
        // Fall back to manual download
      }

      // Manual: create skill dir and fetch SKILL.md
      fs.ensureDirSync(targetDir);
      const rawUrl = `https://raw.githubusercontent.com/${skill.repo}/main/${skill.path === '.' ? '' : skill.path + '/'}SKILL.md`;
      try {
        const content = execSync(`curl -sL "${rawUrl}"`, { stdio: 'pipe', timeout: 15000 }).toString();
        if (content && content.length > 50 && !content.includes('404')) {
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
