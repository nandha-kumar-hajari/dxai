import { execSync, execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { successMsg, warnMsg } from './branding.js';
import { isSafeBinaryName } from './registry/validate.js';

// ── OS Detection ──
export function detectOS() {
  const platform = os.platform();
  const map = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };
  return {
    platform,
    name: map[platform] || platform,
    arch: os.arch(),
    home: os.homedir(),
    isWindows: platform === 'win32',
    isMac: platform === 'darwin',
    isLinux: platform === 'linux',
  };
}

// ── Command existence check ──
export function commandExists(cmd) {
  // `cmd` is interpolated into a shell string below. Agent detect commands are
  // hardcoded, but automation-tool detect commands come from the (untrusted,
  // network-refreshed) registry — so even though the payload is validated at
  // the fetch boundary, refuse anything but a bare binary name here too.
  if (!isSafeBinaryName(cmd)) return false;
  try {
    const check = os.platform() === 'win32'
      ? `where ${cmd} 2>nul`
      : `command -v ${cmd} 2>/dev/null`;
    execSync(check, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_APPLICATIONS_DIR = '/Applications';

function appExists(appName, applicationsDir = DEFAULT_APPLICATIONS_DIR) {
  if (!appName || os.platform() !== 'darwin') return false;
  return fs.existsSync(path.join(applicationsDir, appName));
}

// Version of a macOS app bundle, from Info.plist. Some agents (the Antigravity
// desktop app) ship no shell command at all, so this is the only version signal.
function appVersion(appName, applicationsDir = DEFAULT_APPLICATIONS_DIR) {
  try {
    const plist = fs.readFileSync(path.join(applicationsDir, appName, 'Contents', 'Info.plist'), 'utf-8');
    const match = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
    return match ? match[1].trim() : null;
  } catch {
    return null; // not a bundle we can read — version simply stays unknown
  }
}

// First existing path from an agent's `detectPaths` — install locations that
// are documented but commonly missing from PATH (e.g. ~/.local/bin). These are
// hardcoded absolute paths, never registry data.
function findInstalledPath(def, home) {
  const candidates = typeof def.detectPaths === 'function' ? def.detectPaths(home) : [];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function toList(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function parseVersion(out) {
  const match = out.match(/(\d+\.\d+[.\d]*)/);
  return match ? match[1] : out.slice(0, 30);
}

function getVersion(cmd, flag = '--version') {
  if (!isSafeBinaryName(cmd)) return null;
  try {
    return parseVersion(execSync(`${cmd} ${flag}`, { stdio: 'pipe', timeout: 10000 }).toString().trim());
  } catch {
    return null;
  }
}

// Version of a binary found by absolute path (argv form — no shell involved).
function getVersionAtPath(binPath, flag = '--version') {
  try {
    return parseVersion(execFileSync(binPath, [flag], { stdio: 'pipe', timeout: 10000 }).toString().trim());
  } catch {
    return null;
  }
}

// ── Prerequisites ──
export function checkPrerequisites() {
  const pyCmd = commandExists('python3') ? 'python3' : (commandExists('python') ? 'python' : null);
  return {
    node: { installed: commandExists('node'), version: getVersion('node') },
    git: { installed: commandExists('git'), version: getVersion('git') },
    python: { installed: !!pyCmd, command: pyCmd, version: pyCmd ? getVersion(pyCmd) : null },
  };
}

// ── Agent Detection ──
//
// AGENT_DEFINITIONS is the single source of truth for every tool dxai supports.
// Each entry is verified against the vendor's current documentation and carries
// `docs` (the pages it was checked against) and `verifiedAt` (when). The weekly
// agent-health workflow (scripts/agent-health.mjs) flags entries whose
// `verifiedAt` is older than the review window, whose Homebrew cask / winget
// package has vanished or been deprecated, or whose docs URLs have moved — so
// vendor churn surfaces as an issue instead of a silent detection gap.
//
// Detection fields: `detectCommand` (one or more binary names probed on PATH),
// `detectApp` (one or more macOS bundles under /Applications), and `detectPaths`
// (absolute install locations to check when the binary is not on PATH). Any hit
// counts as installed; `configDir` existing is reported separately as
// `configExists`.
//
// `mcpDialect` describes how an agent expresses an MCP server, so a server can
// declare its `transport` once and have its per-agent config blocks derived
// (see renderAgentConfig + src/registry/mcp-servers.js#deriveConfigs). Adding a
// new agent here is enough to make every transport-based server support it.
//   - { kind: 'json', urlKey, typed?, envRef }
//       JSON config. HTTP servers use `urlKey`; stdio uses command/args/env.
//       `typed` = { http: 'http', stdio: 'stdio' } adds a `type` field where the
//       agent's schema requires one. `envRef` is how the agent references an
//       environment variable inside its config file:
//         'dollar'  → ${VAR}        (Gemini CLI, Claude Code .mcp.json)
//         'vscode'  → ${env:VAR}    (VS Code, Cursor, Devin)
//         'literal' → no interpolation documented; dxai substitutes the value
//                     from its own environment at write time (Antigravity)
//   - { kind: 'toml' }         → Codex-style TOML block; env vars are forwarded
//                                by name via `env_vars` (Codex never interpolates)
//   - { kind: 'claude-cli' }   → `claude mcp add ...` argv at user scope; env vars
//                                are passed as `--env VAR=${VAR}` and resolved at
//                                run time (Claude Code expands nothing at user scope)
// `projectMcpDialect` overrides the dialect for the project-level file when it
// differs from the global one (Claude Code: CLI globally, .mcp.json in projects).

const VERIFIED = '2026-09-10';

function vscodeUserDir(home, product) {
  const platform = os.platform();
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', product, 'User');
  if (platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), product, 'User');
  return path.join(home, '.config', product, 'User');
}

function devinConfigDir(home) {
  if (os.platform() === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'devin');
  return path.join(home, '.config', 'devin');
}

const codexHome = (home) => process.env.CODEX_HOME || path.join(home, '.codex');
const claudeConfigDir = (home) => process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');

const ANTIGRAVITY_MCP = (home) => path.join(home, '.gemini', 'config', 'mcp_config.json');
const ANTIGRAVITY_DIALECT = { kind: 'json', urlKey: 'serverUrl', envRef: 'literal' };
const ANTIGRAVITY_DOCS = ['https://antigravity.google/docs/mcp/', 'https://antigravity.google/docs/cli/getting-started/'];

const DEVIN_MCP = (home) => path.join(devinConfigDir(home), 'mcp_config.json');
const DEVIN_DIALECT = { kind: 'json', urlKey: 'url', envRef: 'vscode' };
const DEVIN_DOCS = ['https://docs.devin.ai/cli/extensibility/mcp/configuration', 'https://docs.devin.ai/desktop/getting-started'];

export const AGENT_DEFINITIONS = [
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'AI-first IDE (VS Code fork)',
    detectCommand: 'cursor',
    detectApp: 'Cursor.app',
    configDir: (home) => path.join(home, '.cursor'),
    globalMcpPath: (home) => path.join(home, '.cursor', 'mcp.json'),
    projectMcpPath: () => path.join('.cursor', 'mcp.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    // Cursor's schema lists `type` as required for stdio only; remote servers
    // are just { url, headers?, auth? }.
    mcpDialect: { kind: 'json', urlKey: 'url', typed: { stdio: 'stdio' }, envRef: 'vscode' },
    install: { brewCask: 'cursor', winget: 'Anysphere.Cursor' },
    docs: ['https://cursor.com/docs/context/mcp', 'https://cursor.com/docs/get-started/installation'],
    verifiedAt: VERIFIED,
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic\'s terminal AI agent (also bundled in the Claude desktop app)',
    detectCommand: 'claude',
    detectApp: 'Claude.app',   // the desktop app ships Claude Code and shares its config
    detectPaths: (home) => [path.join(home, '.local', 'bin', 'claude')],
    configDir: claudeConfigDir,
    globalMcpPath: (home) => path.join(home, '.claude.json'),
    configFormat: 'cli',  // uses `claude mcp add --scope user`
    mcpKey: 'mcpServers',
    mcpDialect: { kind: 'claude-cli' },
    // Project scope is a plain JSON file at the repo root with ${VAR} expansion.
    projectMcpPath: () => '.mcp.json',
    projectConfigFormat: 'json',
    projectMcpKey: 'mcpServers',
    projectMcpDialect: { kind: 'json', urlKey: 'url', typed: { http: 'http', stdio: 'stdio' }, envRef: 'dollar' },
    install: { brewCask: 'claude-code', winget: 'Anthropic.ClaudeCode' },
    docs: ['https://code.claude.com/docs/en/mcp', 'https://code.claude.com/docs/en/setup'],
    verifiedAt: VERIFIED,
  },
  {
    id: 'vscode',
    name: 'VS Code / GitHub Copilot',
    description: 'VS Code with Copilot agent mode',
    detectCommand: 'code',
    detectApp: 'Visual Studio Code.app',
    configDir: (home) => vscodeUserDir(home, 'Code'),
    globalMcpPath: (home) => path.join(vscodeUserDir(home, 'Code'), 'mcp.json'),
    projectMcpPath: () => path.join('.vscode', 'mcp.json'),
    configFormat: 'json',
    mcpKey: 'servers',
    mcpDialect: { kind: 'json', urlKey: 'url', typed: { http: 'http', stdio: 'stdio' }, envRef: 'vscode' },
    install: { brewCask: 'visual-studio-code', winget: 'Microsoft.VisualStudioCode' },
    docs: ['https://code.visualstudio.com/docs/agents/reference/mcp-configuration', 'https://code.visualstudio.com/docs/setup/linux'],
    verifiedAt: VERIFIED,
  },
  {
    id: 'vscode-insiders',
    name: 'VS Code Insiders',
    description: 'VS Code Insiders build with Copilot agent mode',
    detectCommand: 'code-insiders',
    detectApp: 'Visual Studio Code - Insiders.app',
    configDir: (home) => vscodeUserDir(home, 'Code - Insiders'),
    globalMcpPath: (home) => path.join(vscodeUserDir(home, 'Code - Insiders'), 'mcp.json'),
    projectMcpPath: () => path.join('.vscode', 'mcp.json'),
    configFormat: 'json',
    mcpKey: 'servers',
    mcpDialect: { kind: 'json', urlKey: 'url', typed: { http: 'http', stdio: 'stdio' }, envRef: 'vscode' },
    install: { brewCask: 'visual-studio-code@insiders', winget: 'Microsoft.VisualStudioCode.Insiders' },
    docs: ['https://code.visualstudio.com/docs/agents/reference/mcp-configuration', 'https://code.visualstudio.com/docs/configure/profiles'],
    verifiedAt: VERIFIED,
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    description: 'OpenAI\'s coding agent (CLI, IDE extension, and the ChatGPT desktop app share one config)',
    detectCommand: 'codex',
    detectApp: 'ChatGPT.app',   // the standalone Codex app was folded into ChatGPT in July 2026
    configDir: codexHome,
    globalMcpPath: (home) => path.join(codexHome(home), 'config.toml'),
    // Project-level config is honoured for trusted projects only.
    projectMcpPath: () => path.join('.codex', 'config.toml'),
    projectConfigFormat: 'toml',
    configFormat: 'toml',
    mcpKey: 'mcp_servers',
    mcpDialect: { kind: 'toml' },
    install: { brewCask: 'codex' },
    docs: ['https://learn.chatgpt.com/docs/config-file/config-reference', 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli'],
    verifiedAt: VERIFIED,
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'Google\'s terminal AI agent (paid API keys and Code Assist licences only)',
    // Since 2026-06-18 Gemini CLI no longer serves free-tier or Google One
    // accounts; Antigravity CLI (`agy`) is the consumer successor. Paths and
    // config format are unchanged and the npm package still ships.
    notice: 'Gemini CLI stopped serving free and Google One accounts on 2026-06-18. Consumer users should pick Antigravity CLI instead.',
    detectCommand: 'gemini',
    configDir: (home) => path.join(home, '.gemini'),
    globalMcpPath: (home) => path.join(home, '.gemini', 'settings.json'),
    projectMcpPath: () => path.join('.gemini', 'settings.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: { kind: 'json', urlKey: 'httpUrl', envRef: 'dollar' },
    install: {},   // Homebrew formula is deprecated (2026-06-18); npm only
    docs: ['https://geminicli.com/docs/tools/mcp-server/', 'https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/'],
    verifiedAt: VERIFIED,
  },
  // Antigravity 2.x is three separate installs — the desktop agent app, the IDE
  // (a separate download), and the `agy` CLI — that share one MCP config file at
  // ~/.gemini/config/mcp_config.json. Each keeps its own state dir under ~/.gemini.
  {
    id: 'antigravity',
    name: 'Antigravity',
    description: 'Google\'s desktop agent app (Antigravity 2.0)',
    detectApp: 'Antigravity.app',   // ships no shell command
    configDir: (home) => path.join(home, '.gemini', 'antigravity'),
    globalMcpPath: ANTIGRAVITY_MCP,
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: ANTIGRAVITY_DIALECT,
    install: { brewCask: 'antigravity' },
    docs: ANTIGRAVITY_DOCS,
    verifiedAt: VERIFIED,
  },
  {
    id: 'antigravity-ide',
    name: 'Antigravity IDE',
    description: 'Google\'s agent-first AI IDE',
    // The in-app "install agy-ide command in PATH" shim; Homebrew links both names.
    detectCommand: ['agy-ide', 'antigravity-ide'],
    detectApp: 'Antigravity IDE.app',
    detectPaths: (home) => [path.join(home, '.antigravity-ide', 'antigravity-ide', 'bin', 'agy-ide')],
    configDir: (home) => path.join(home, '.gemini', 'antigravity-ide'),
    globalMcpPath: ANTIGRAVITY_MCP,
    projectMcpPath: () => path.join('.agents', 'mcp_config.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: ANTIGRAVITY_DIALECT,
    install: { brewCask: 'antigravity-ide' },
    docs: ANTIGRAVITY_DOCS,
    verifiedAt: VERIFIED,
  },
  {
    id: 'antigravity-cli',
    name: 'Antigravity CLI',
    description: 'Google\'s terminal AI agent (successor to Gemini CLI)',
    detectCommand: 'agy',
    // The installer drops the binary here; ~/.local/bin is often not on PATH.
    detectPaths: (home) => [
      path.join(home, '.local', 'bin', 'agy'),
      path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'agy', 'bin', 'agy.exe'),
    ],
    configDir: (home) => path.join(home, '.gemini', 'antigravity-cli'),
    globalMcpPath: ANTIGRAVITY_MCP,
    projectMcpPath: () => path.join('.agents', 'mcp_config.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: ANTIGRAVITY_DIALECT,
    install: { brewCask: 'antigravity-cli' },
    docs: ANTIGRAVITY_DOCS,
    verifiedAt: VERIFIED,
  },
  // Windsurf became Devin Desktop on 2026-06-02 (Cognition); the Cascade agent
  // was removed on 2026-09-08 and Devin Local is the only agent, so the MCP
  // config moved from ~/.codeium/windsurf/ to ~/.config/devin/. Devin still
  // imports the old file on read. The Devin CLI shares the same config files.
  {
    id: 'devin-desktop',
    name: 'Devin Desktop',
    description: 'Cognition\'s agentic IDE (formerly Windsurf)',
    detectCommand: ['devin-desktop', 'windsurf'],
    detectApp: ['Devin.app', 'Windsurf.app'],
    configDir: devinConfigDir,
    globalMcpPath: DEVIN_MCP,
    // Where dxai wrote servers for Windsurf; still scanned by status/cleanup.
    legacyGlobalMcpPaths: (home) => [path.join(home, '.codeium', 'windsurf', 'mcp_config.json')],
    projectMcpPath: () => path.join('.devin', 'mcp_config.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: DEVIN_DIALECT,
    install: { brewCask: 'devin-desktop', winget: 'CognitionAI.DevinDesktop' },
    docs: DEVIN_DOCS,
    verifiedAt: VERIFIED,
  },
  {
    id: 'devin-cli',
    name: 'Devin CLI',
    description: 'Cognition\'s terminal coding agent',
    detectCommand: 'devin',
    configDir: (home) => path.join(home, '.devin'),
    globalMcpPath: DEVIN_MCP,
    projectMcpPath: () => path.join('.devin', 'mcp_config.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: DEVIN_DIALECT,
    install: { brewCask: 'devin-cli', winget: 'CognitionAI.DevinCLI' },
    docs: ['https://docs.devin.ai/cli', 'https://docs.devin.ai/cli/extensibility/mcp/configuration'],
    verifiedAt: VERIFIED,
  },
];

// Former agent ids that profiles, manifests and `--agents` flags may still carry.
// Resolved by normalizeAgentIds / findAgent so a rename never breaks a user.
export const AGENT_ID_ALIASES = {
  windsurf: 'devin-desktop',
};

export function normalizeAgentIds(ids) {
  return [...new Set((ids || []).map((id) => AGENT_ID_ALIASES[id] || id))];
}

export function findAgent(id) {
  const resolved = AGENT_ID_ALIASES[id] || id;
  return AGENT_DEFINITIONS.find((a) => a.id === resolved) || null;
}

// Config-key aliases. A catalogue entry may carry a single family-level block
// (some were authored that way before the family was split into agents, or
// under a product's former name). Since every member of a family reads the same
// config file with the same dialect, derivation fans that one block out to each
// member. An alias may share its name with a real agent id, in which case that
// agent keeps the block and the other targets receive a copy.
export const MCP_CONFIG_ALIASES = {
  antigravity: ['antigravity', 'antigravity-ide', 'antigravity-cli'],
  windsurf: ['devin-desktop', 'devin-cli'],
};

function envRefFor(dialect, name) {
  // 'literal' still writes the placeholder — config-writer substitutes the real
  // value from dxai's own environment at write time.
  return dialect.envRef === 'vscode' ? `\${env:${name}}` : `\${${name}}`;
}

// Derive an agent's MCP config block from a server's canonical `transport`.
// Returns the config object (or, for Codex, a { toml } wrapper), or null when
// the server has no transport / the agent has no dialect. Pass { project: true }
// to render for the agent's project-level file (falls back to the global dialect
// when the agent has no separate one).
export function renderAgentConfig(agent, server, { project = false } = {}) {
  const transport = server?.transport;
  const dialect = project ? (agent?.projectMcpDialect || agent?.mcpDialect) : agent?.mcpDialect;
  if (!transport || !dialect) return null;

  const { id } = server;
  const envVars = server.requiresEnv ? Object.keys(server.requiresEnv) : [];

  switch (dialect.kind) {
    case 'json': {
      if (transport.type === 'http') {
        if (!transport.url) return null;
        const cfg = {};
        if (dialect.typed?.http) cfg.type = dialect.typed.http;
        cfg[dialect.urlKey] = transport.url;
        return cfg;
      }
      if (transport.type === 'stdio') {
        const cfg = {};
        if (dialect.typed?.stdio) cfg.type = dialect.typed.stdio;
        cfg.command = transport.command;
        cfg.args = [...(transport.args || [])];
        if (envVars.length) {
          cfg.env = {};
          for (const v of envVars) cfg.env[v] = envRefFor(dialect, v);
        }
        return cfg;
      }
      return null;
    }
    case 'claude-cli': {
      // `--env` must not be immediately followed by the server name (the CLI would
      // read the name as another KEY=value pair), so `--transport` sits between.
      const head = ['mcp', 'add', '--scope', 'user'];
      for (const v of envVars) head.push('--env', `${v}=\${${v}}`);
      if (transport.type === 'http') {
        return { command: 'claude', args: [...head, '--transport', 'http', id, transport.url] };
      }
      if (transport.type === 'stdio') {
        return { command: 'claude', args: [...head, '--transport', 'stdio', id, '--', transport.command, ...(transport.args || [])] };
      }
      return null;
    }
    case 'toml': {
      if (transport.type === 'http') {
        return { toml: `[mcp_servers.${id}]\nurl = "${transport.url}"` };
      }
      if (transport.type === 'stdio') {
        const argsList = (transport.args || []).map((a) => `"${a}"`).join(', ');
        let toml = `[mcp_servers.${id}]\ncommand = "${transport.command}"\nargs = [${argsList}]`;
        // Codex forwards named variables from its own environment; `env` values
        // are literal and never interpolated.
        if (envVars.length) toml += `\nenv_vars = [${envVars.map((v) => `"${v}"`).join(', ')}]`;
        return { toml };
      }
      return null;
    }
    default:
      return null;
  }
}

export function detectAgents(home, { applicationsDir = DEFAULT_APPLICATIONS_DIR } = {}) {
  const agents = AGENT_DEFINITIONS.map((def) => {
    const commandFound = toList(def.detectCommand).find((cmd) => commandExists(cmd)) || null;
    const pathFound = commandFound ? null : findInstalledPath(def, home);
    const appFound = toList(def.detectApp).find((app) => appExists(app, applicationsDir)) || null;
    const configExists = fs.existsSync(def.configDir(home));
    const installed = Boolean(commandFound || pathFound || appFound);
    let version = null;
    if (commandFound) version = getVersion(commandFound);
    else if (pathFound) version = getVersionAtPath(pathFound);
    else if (appFound) version = appVersion(appFound, applicationsDir);
    return {
      ...def,
      installed,
      configExists,
      version,
    };
  });
  return agents;
}

export function printDetectionResults(osInfo, prereqs, agents) {
  successMsg(`${osInfo.name} ${osInfo.arch}`);

  if (prereqs.node.installed) {
    successMsg(`Node.js ${prereqs.node.version}`);
  } else {
    warnMsg('Node.js not found (required)');
  }
  if (prereqs.git.installed) {
    successMsg(`Git ${prereqs.git.version}`);
  } else {
    warnMsg('Git not found');
  }
  if (prereqs.python.installed) {
    successMsg(`Python ${prereqs.python.version}`);
  }

  const found = agents.filter((a) => a.installed);
  if (found.length > 0) {
    successMsg(`Detected: ${found.map((a) => a.name).join(', ')}`);
  } else {
    warnMsg('No AI agents detected — you can still select which ones to configure');
  }
  for (const a of found) {
    if (a.notice) warnMsg(`${a.name}: ${a.notice}`);
  }
}

// ── Automation Tool Detection ──
export function detectAutomationTools(toolRegistry) {
  return toolRegistry.map((tool) => ({
    ...tool,
    installed: commandExists(tool.detectCommand),
  }));
}

// ── Agent Install Commands ──
// One line per OS, shown when a selected agent is not detected. Keep these to
// the vendor's documented primary method; `install.brewCask` / `install.winget`
// on the definition are the machine-checkable ids the health check verifies.
export const INSTALL_COMMANDS = {
  'cursor': {
    macOS: 'brew install --cask cursor',
    Linux: 'Add the Cursor apt/dnf repo, then `sudo apt install cursor` — https://cursor.com/docs/get-started/installation',
    Windows: 'winget install Anysphere.Cursor',
  },
  'claude-code': {
    macOS: 'brew install --cask claude-code',
    Linux: 'curl -fsSL https://claude.ai/install.sh | bash',
    Windows: 'winget install Anthropic.ClaudeCode',
  },
  'vscode': {
    macOS: 'brew install --cask visual-studio-code',
    Linux: 'sudo snap install --classic code',
    Windows: 'winget install Microsoft.VisualStudioCode',
  },
  'vscode-insiders': {
    macOS: 'brew install --cask visual-studio-code@insiders',
    Linux: 'sudo snap install --classic code-insiders',
    Windows: 'winget install Microsoft.VisualStudioCode.Insiders',
  },
  'codex': {
    macOS: 'brew install --cask codex',
    Linux: 'npm install -g @openai/codex',
    Windows: 'npm install -g @openai/codex',
  },
  'gemini': {
    macOS: 'npm install -g @google/gemini-cli',
    Linux: 'npm install -g @google/gemini-cli',
    Windows: 'npm install -g @google/gemini-cli',
  },
  'antigravity': {
    macOS: 'brew install --cask antigravity',
    Linux: 'Download from https://antigravity.google/download',
    Windows: 'Download from https://antigravity.google/download',
  },
  'antigravity-ide': {
    macOS: 'brew install --cask antigravity-ide',
    Linux: 'Download from https://antigravity.google/download',
    Windows: 'Download from https://antigravity.google/download',
  },
  'antigravity-cli': {
    macOS: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    Linux: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    Windows: 'irm https://antigravity.google/cli/install.ps1 | iex',
  },
  'devin-desktop': {
    macOS: 'brew install --cask devin-desktop',
    Linux: 'Add the Devin apt/yum repo, then `sudo apt install devin-desktop` — https://docs.devin.ai/desktop/getting-started',
    Windows: 'winget install CognitionAI.DevinDesktop',
  },
  'devin-cli': {
    macOS: 'brew install --cask devin-cli',
    Linux: 'curl -fsSL https://cli.devin.ai/install.sh | bash',
    Windows: 'irm https://static.devin.ai/cli/setup.ps1 | iex',
  },
};
