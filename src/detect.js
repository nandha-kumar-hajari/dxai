import { execSync } from 'child_process';
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
function commandExists(cmd) {
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

function appExists(appName) {
  if (!appName || os.platform() !== 'darwin') return false;
  return fs.existsSync(path.join('/Applications', appName));
}

function getVersion(cmd, flag = '--version') {
  if (!isSafeBinaryName(cmd)) return null;
  try {
    const out = execSync(`${cmd} ${flag}`, { stdio: 'pipe', timeout: 10000 }).toString().trim();
    const match = out.match(/(\d+\.\d+[.\d]*)/);
    return match ? match[1] : out.slice(0, 30);
  } catch {
    return null;
  }
}

// ── Prerequisites ──
export function checkPrerequisites() {
  const results = {};

  // Node.js
  results.node = {
    installed: commandExists('node'),
    version: getVersion('node'),
  };

  // npm
  results.npm = {
    installed: commandExists('npm'),
    version: getVersion('npm'),
  };

  // git
  results.git = {
    installed: commandExists('git'),
    version: getVersion('git'),
  };

  // Python
  const pyCmd = commandExists('python3') ? 'python3' : (commandExists('python') ? 'python' : null);
  results.python = {
    installed: !!pyCmd,
    command: pyCmd,
    version: pyCmd ? getVersion(pyCmd) : null,
  };

  // pip
  const pipCmd = commandExists('pip3') ? 'pip3' : (commandExists('pip') ? 'pip' : null);
  results.pip = {
    installed: !!pipCmd,
    command: pipCmd,
  };

  // npx
  results.npx = {
    installed: commandExists('npx'),
  };

  return results;
}

// ── Agent Detection ──
//
// `mcpDialect` describes how an agent expresses an MCP server, so a server can
// declare its `transport` once and have its per-agent config blocks derived
// (see renderAgentConfig + src/registry/mcp-servers.js#deriveConfigs). Adding a
// new agent here is enough to make every transport-based server support it.
//   - { kind: 'json', urlKey }  → JSON config; HTTP servers use urlKey, stdio uses command/args/env
//   - { kind: 'toml' }          → Codex-style TOML string block
//   - { kind: 'claude-cli' }    → `claude mcp add ...` argv
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
    mcpDialect: { kind: 'json', urlKey: 'url' },
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic\'s terminal AI agent',
    detectCommand: 'claude',
    configDir: (home) => path.join(home, '.claude'),
    globalMcpPath: (home) => path.join(home, '.claude.json'),
    configFormat: 'cli',  // uses `claude mcp add`
    mcpKey: 'mcpServers',
    mcpDialect: { kind: 'claude-cli' },
  },
  {
    id: 'vscode',
    name: 'VS Code / GitHub Copilot',
    description: 'VS Code with Copilot agent mode',
    detectCommand: 'code',
    detectApp: 'Visual Studio Code.app',
    configDir: (home) => {
      const platform = os.platform();
      if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Code', 'User');
      if (platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'Code', 'User');
      return path.join(home, '.config', 'Code', 'User');
    },
    globalMcpPath: (home) => {
      const platform = os.platform();
      if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
      if (platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'mcp.json');
      return path.join(home, '.config', 'Code', 'User', 'mcp.json');
    },
    projectMcpPath: () => path.join('.vscode', 'mcp.json'),
    configFormat: 'json',
    mcpKey: 'servers',
    mcpDialect: { kind: 'json', urlKey: 'url' },
  },
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    description: 'OpenAI\'s terminal coding agent',
    detectCommand: 'codex',
    configDir: (home) => path.join(home, '.codex'),
    globalMcpPath: (home) => path.join(home, '.codex', 'config.toml'),
    configFormat: 'toml',
    mcpKey: 'mcp_servers',
    mcpDialect: { kind: 'toml' },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'Google\'s terminal AI agent',
    detectCommand: 'gemini',
    configDir: (home) => path.join(home, '.gemini'),
    globalMcpPath: (home) => path.join(home, '.gemini', 'settings.json'),
    projectMcpPath: () => path.join('.gemini', 'settings.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: { kind: 'json', urlKey: 'httpUrl' },
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: 'Codeium\'s AI IDE',
    detectCommand: 'windsurf',
    detectApp: 'Windsurf.app',
    configDir: (home) => path.join(home, '.codeium', 'windsurf'),
    globalMcpPath: (home) => path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: { kind: 'json', urlKey: 'serverUrl' },
  },
  {
    id: 'antigravity-ide',
    name: 'Antigravity IDE',
    description: 'Google\'s agent-first AI IDE',
    detectCommand: 'antigravity-ide',
    detectApp: 'Antigravity IDE.app',
    configDir: (home) => path.join(home, '.gemini', 'antigravity-ide'),
    globalMcpPath: (home) => path.join(home, '.gemini', 'config', 'mcp_config.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: { kind: 'json', urlKey: 'serverUrl' },
  },
  {
    id: 'antigravity-cli',
    name: 'Antigravity CLI',
    description: 'Google\'s terminal AI agent',
    detectCommand: 'agy',
    configDir: (home) => path.join(home, '.gemini', 'antigravity-cli'),
    globalMcpPath: (home) => path.join(home, '.gemini', 'config', 'mcp_config.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
    mcpDialect: { kind: 'json', urlKey: 'serverUrl' },
  },
];

// Legacy config-key aliases. Some catalogue entries were authored with a single
// `antigravity` key before the IDE and CLI were split into two agents that share
// one config file (~/.gemini/config/mcp_config.json). Derivation expands the alias
// to both real agent ids so those servers reach Antigravity users.
export const MCP_CONFIG_ALIASES = {
  antigravity: ['antigravity-ide', 'antigravity-cli'],
};

// Derive an agent's MCP config block from a server's canonical `transport`.
// Returns the config object (or, for Codex, a { toml } wrapper), or null when
// the server has no transport / the agent has no dialect. Env vars come from the
// server's `requiresEnv` keys, rendered per dialect (`${VAR}` for JSON, `$VAR`
// for TOML; the claude-cli dialect inherits them from the parent process).
export function renderAgentConfig(agent, server) {
  const transport = server?.transport;
  const dialect = agent?.mcpDialect;
  if (!transport || !dialect) return null;

  const { id } = server;
  const envVars = server.requiresEnv ? Object.keys(server.requiresEnv) : [];

  switch (dialect.kind) {
    case 'json': {
      if (transport.type === 'http') {
        return transport.url ? { [dialect.urlKey]: transport.url } : null;
      }
      if (transport.type === 'stdio') {
        const cfg = { command: transport.command, args: [...(transport.args || [])] };
        if (envVars.length) {
          cfg.env = {};
          for (const v of envVars) cfg.env[v] = `\${${v}}`;
        }
        return cfg;
      }
      return null;
    }
    case 'claude-cli': {
      if (transport.type === 'http') {
        return { command: 'claude', args: ['mcp', 'add', id, '--transport', 'http', transport.url] };
      }
      if (transport.type === 'stdio') {
        return { command: 'claude', args: ['mcp', 'add', id, '--', transport.command, ...(transport.args || [])] };
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
        if (envVars.length) {
          toml += `\n\n[mcp_servers.${id}.env]\n` + envVars.map((v) => `${v} = "$${v}"`).join('\n');
        }
        return { toml };
      }
      return null;
    }
    default:
      return null;
  }
}

export function detectAgents(home) {
  const agents = AGENT_DEFINITIONS.map((def) => {
    const commandFound = commandExists(def.detectCommand);
    const appFound = appExists(def.detectApp);
    const configExists = fs.existsSync(def.configDir(home));
    const installed = commandFound || appFound;
    const version = commandFound ? getVersion(def.detectCommand) : null;
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
  // OS
  successMsg(`${osInfo.name} ${osInfo.arch}`);

  // Prerequisites
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

  // Agents
  const found = agents.filter((a) => a.installed);
  if (found.length > 0) {
    successMsg(`Detected: ${found.map((a) => a.name).join(', ')}`);
  } else {
    warnMsg('No AI agents detected — you can still select which ones to configure');
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
export const INSTALL_COMMANDS = {
  'cursor': {
    macOS: 'brew install --cask cursor',
    Linux: 'Download from https://cursor.com/downloads',
    Windows: 'winget install Anysphere.Cursor',
  },
  'claude-code': {
    macOS: 'brew install claude-code',
    Linux: 'curl -fsSL https://claude.ai/install.sh | sh',
    Windows: 'npm install -g @anthropic-ai/claude-code',
  },
  'vscode': {
    macOS: 'brew install --cask visual-studio-code',
    Linux: 'sudo snap install code --classic',
    Windows: 'winget install Microsoft.VisualStudioCode',
  },
  'codex': {
    macOS: 'npm install -g @openai/codex',
    Linux: 'npm install -g @openai/codex',
    Windows: 'npm install -g @openai/codex',
  },
  'gemini': {
    macOS: 'npm install -g @google/gemini-cli',
    Linux: 'npm install -g @google/gemini-cli',
    Windows: 'npm install -g @google/gemini-cli',
  },
  'windsurf': {
    macOS: 'brew install --cask windsurf',
    Linux: 'Download from https://windsurf.com/download',
    Windows: 'winget install Codeium.Windsurf',
  },
  'antigravity-ide': {
    macOS: 'Download from https://antigravity.google/download',
    Linux: 'Download from https://antigravity.google/download',
    Windows: 'Download from https://antigravity.google/download',
  },
  'antigravity-cli': {
    macOS: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    Linux: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    Windows: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
  },
};
