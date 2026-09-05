import fs from 'fs-extra';
import path from 'path';
import { execFileSync } from 'child_process';
import { warnMsg } from './branding.js';
import { writeJsonAtomic, writeFileAtomic } from './fs-atomic.js';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Line-anchored [mcp_servers.<id>] header matcher — avoids matching a
// commented-out header or an id that is a prefix of another.
function tomlHeaderRe(id) {
  return new RegExp(`^\\s*\\[mcp_servers\\.${escapeRegExp(id)}\\]`, 'm');
}

// ── JSON Config Scanning & Removal ──

// Scan a JSON config file for known MCP server IDs under a given key.
// Returns array of server IDs found.
export function scanJsonMcpConfig(filePath, mcpKey, knownIds) {
  if (!fs.existsSync(filePath)) return [];

  try {
    const config = fs.readJsonSync(filePath);
    if (!config[mcpKey] || typeof config[mcpKey] !== 'object') return [];

    return knownIds.filter((id) => id in config[mcpKey]);
  } catch (err) {
    warnMsg(`Could not parse ${filePath}: ${err.message}`);
    return [];
  }
}

// Remove specific server IDs from a JSON MCP config.
// If the mcpKey object becomes empty, removes it entirely.
export function removeJsonMcpServers(filePath, mcpKey, idsToRemove) {
  if (!fs.existsSync(filePath)) return { removed: 0 };

  let config;
  try {
    config = fs.readJsonSync(filePath);
  } catch (err) {
    // Surface rather than silently report "removed 0" on a file we couldn't read.
    throw new Error(`Could not parse ${filePath} as JSON: ${err.message}`, { cause: err });
  }

  if (!config[mcpKey] || typeof config[mcpKey] !== 'object') return { removed: 0 };

  let removed = 0;
  for (const id of idsToRemove) {
    if (id in config[mcpKey]) {
      delete config[mcpKey][id];
      removed++;
    }
  }

  if (Object.keys(config[mcpKey]).length === 0) {
    delete config[mcpKey];
  }

  writeJsonAtomic(filePath, config, { spaces: 2 });
  return { removed };
}

// ── TOML Config Scanning & Removal ──

// Scan a TOML config file for known MCP server sections.
// Looks for [mcp_servers.<id>] patterns.
export function scanTomlMcpConfig(filePath, knownIds) {
  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return knownIds.filter((id) => tomlHeaderRe(id).test(content));
  } catch {
    return [];
  }
}

// Remove TOML sections for specific server IDs.
// Removes from [mcp_servers.<id>] to the next section header or end of file.
export function removeTomlMcpServers(filePath, idsToRemove) {
  if (!fs.existsSync(filePath)) return { removed: 0 };

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { removed: 0 };
  }

  let removed = 0;
  for (const id of idsToRemove) {
    // Locate the header at the start of a line so a commented-out or
    // prefix-colliding header isn't matched.
    const headerMatch = tomlHeaderRe(id).exec(content);
    if (!headerMatch) continue;
    const idx = headerMatch.index;

    // Find the end: next section header (line starting with [) or end of file
    const afterHeader = content.indexOf('\n', idx);
    if (afterHeader === -1) {
      // Section header is at end of file
      content = content.slice(0, idx).trimEnd() + '\n';
      removed++;
      continue;
    }

    const rest = content.slice(afterHeader + 1);
    const nextSectionMatch = rest.match(/^(\[(?!\[))/m);
    let endIdx;
    if (nextSectionMatch) {
      endIdx = afterHeader + 1 + nextSectionMatch.index;
    } else {
      endIdx = content.length;
    }

    // Also trim leading blank lines before the section
    let startIdx = idx;
    while (startIdx > 0 && content[startIdx - 1] === '\n') startIdx--;
    if (startIdx > 0) startIdx++; // keep one newline

    content = content.slice(0, startIdx) + content.slice(endIdx);
    removed++;
  }

  content = content.trimEnd() + '\n';
  writeFileAtomic(filePath, content);
  return { removed };
}

// ── Claude Code CLI Scanning & Removal ──

// True when `id` appears in `claude mcp list` output as a whole token — a bare
// substring check would let "git" match "github" and skip/remove the wrong
// server. Boundaries are anything outside the id charset [A-Za-z0-9_-].
export function outputHasServerId(output, id) {
  if (!output || !id) return false;
  const re = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(id)}([^A-Za-z0-9_-]|$)`, 'm');
  return re.test(output);
}

// `claude mcp list` output, or '' when the CLI is missing/unresponsive.
// execFileSync (argv, no shell) — the previous `2>/dev/null || true` shell form
// silently broke on Windows cmd.exe, reading every server as "not configured".
export function listClaudeCodeMcpOutput() {
  try {
    return execFileSync('claude', ['mcp', 'list'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    }).toString();
  } catch {
    return '';
  }
}

// Remove MCP servers from Claude Code via CLI.
export function removeClaudeCodeMcpServers(serverIds) {
  let removed = 0;
  const errors = [];

  for (const id of serverIds) {
    try {
      // argv form (no shell) so an id can never be interpreted as a command.
      execFileSync('claude', ['mcp', 'remove', id], {
        stdio: 'pipe',
        timeout: 10000,
      });
      removed++;
    } catch (err) {
      errors.push({ id, error: err.message });
    }
  }

  return { removed, errors };
}

// Scan Claude Code for known MCP server IDs.
export function scanClaudeCodeMcpServers(knownIds) {
  const output = listClaudeCodeMcpOutput();
  if (!output) return [];

  // Filter out cloud-managed servers (lines starting with "claude.ai ")
  const localLines = output
    .split('\n')
    .filter((line) => !line.trim().startsWith('claude.ai '))
    .join('\n');

  return knownIds.filter((id) => outputHasServerId(localLines, id));
}

// ── Backup File Scanning ──

// Find .bak.* files alongside the given config file paths.
// Matches siblings of the form <basename>.bak.<ts> only — avoids surfacing
// unrelated backup files when a config sits in a shared dir like $HOME.
export function scanBackupFiles(configFilePaths) {
  const backups = [];

  for (const configPath of configFilePaths) {
    const dir = path.dirname(configPath);
    const base = path.basename(configPath);
    if (!fs.existsSync(dir)) continue;

    try {
      const files = fs.readdirSync(dir);
      const prefix = `${base}.bak.`;
      for (const file of files) {
        if (file.startsWith(prefix)) {
          backups.push(path.join(dir, file));
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  return backups;
}

// ── Skill Directory Scanning ──

// Find installed skill directories matching known skill IDs.
export function scanSkillDirectories(baseDirs, knownSkillIds) {
  const found = [];

  for (const baseDir of baseDirs) {
    if (!fs.existsSync(baseDir)) continue;

    try {
      const entries = fs.readdirSync(baseDir);
      for (const entry of entries) {
        const fullPath = path.join(baseDir, entry);
        if (knownSkillIds.includes(entry) && fs.statSync(fullPath).isDirectory()) {
          found.push({ id: entry, path: fullPath, baseDir });
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  return found;
}

// ── Project File Scanning ──

// Files that may contain user customizations
const CUSTOM_EDIT_FILES = new Set([
  'CLAUDE.md', 'GEMINI.md', 'AGENTS.md',
  '.gitattributes', '.editorconfig',
]);

// Known project files that dxai generates.
const KNOWN_PROJECT_FILES = [
  'CLAUDE.md',
  'GEMINI.md',
  'AGENTS.md',
  '.gitattributes',
  '.editorconfig',
  '.cursorignore',
];

// Scan for dxai-generated project files in the current working directory.
// Returns array of { relativePath, absolutePath, mayHaveCustomEdits }.
export function scanProjectFiles(cwd) {
  const found = [];

  for (const file of KNOWN_PROJECT_FILES) {
    const fullPath = path.join(cwd, file);
    if (fs.existsSync(fullPath)) {
      found.push({
        relativePath: file,
        absolutePath: fullPath,
        mayHaveCustomEdits: CUSTOM_EDIT_FILES.has(file),
      });
    }
  }

  const rulesDir = path.join(cwd, '.cursor', 'rules');
  if (fs.existsSync(rulesDir)) {
    try {
      const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.mdc'));
      for (const file of files) {
        found.push({
          relativePath: path.join('.cursor', 'rules', file),
          absolutePath: path.join(rulesDir, file),
          mayHaveCustomEdits: false,
        });
      }
    } catch {
      // Skip
    }
  }

  const commandsDir = path.join(cwd, '.cursor', 'commands');
  if (fs.existsSync(commandsDir)) {
    try {
      const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        found.push({
          relativePath: path.join('.cursor', 'commands', file),
          absolutePath: path.join(commandsDir, file),
          mayHaveCustomEdits: false,
        });
      }
    } catch {
      // Skip
    }
  }

  return found;
}

// Check if a directory is empty (or only contains empty subdirectories).
export function isEmptyDir(dirPath) {
  if (!fs.existsSync(dirPath)) return true;
  try {
    const entries = fs.readdirSync(dirPath);
    return entries.length === 0;
  } catch {
    return true;
  }
}
