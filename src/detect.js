import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { successMsg, warnMsg, theme } from './branding.js';

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

function getVersion(cmd, flag = '--version') {
  try {
    const out = execSync(`${cmd} ${flag}`, { stdio: 'pipe', timeout: 10000 }).toString().trim();
    const match = out.match(/(\d+\.\d+[\.\d]*)/);
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
export const AGENT_DEFINITIONS = [
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'AI-first IDE (VS Code fork)',
    detectCommand: 'cursor',
    configDir: (home) => path.join(home, '.cursor'),
    globalMcpPath: (home) => path.join(home, '.cursor', 'mcp.json'),
    projectMcpPath: () => path.join('.cursor', 'mcp.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
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
  },
  {
    id: 'vscode',
    name: 'VS Code / GitHub Copilot',
    description: 'VS Code with Copilot agent mode',
    detectCommand: 'code',
    configDir: (home) => {
      const platform = os.platform();
      if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Code', 'User');
      if (platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'Code', 'User');
      return path.join(home, '.config', 'Code', 'User');
    },
    globalMcpPath: () => path.join('.vscode', 'mcp.json'),
    projectMcpPath: () => path.join('.vscode', 'mcp.json'),
    configFormat: 'json',
    mcpKey: 'servers',
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
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: 'Codeium\'s AI IDE',
    detectCommand: 'windsurf',
    configDir: (home) => path.join(home, '.codeium', 'windsurf'),
    globalMcpPath: (home) => path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    description: 'Google\'s agent-first AI IDE',
    detectCommand: 'agy',
    configDir: (home) => path.join(home, '.gemini', 'antigravity'),
    globalMcpPath: (home) => path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
    configFormat: 'json',
    mcpKey: 'mcpServers',
  },
];

export function detectAgents(home) {
  const agents = AGENT_DEFINITIONS.map((def) => {
    const installed = commandExists(def.detectCommand);
    const configExists = fs.existsSync(def.configDir(home));
    const version = installed ? getVersion(def.detectCommand) : null;
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
  const found = agents.filter((a) => a.installed || a.configExists);
  if (found.length > 0) {
    successMsg(`Detected: ${found.map((a) => a.name).join(', ')}`);
  } else {
    warnMsg('No AI agents detected — you can still select which ones to configure');
  }
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
    macOS: 'npm install -g @anthropic-ai/claude-code  # or: brew install gemini-cli',
    Linux: 'npm install -g @google/gemini-cli',
    Windows: 'npm install -g @google/gemini-cli',
  },
  'windsurf': {
    macOS: 'brew install --cask windsurf',
    Linux: 'Download from https://windsurf.com/download',
    Windows: 'winget install Codeium.Windsurf',
  },
  'antigravity': {
    macOS: 'Download from https://antigravity.google/download',
    Linux: 'Download from https://antigravity.google/download',
    Windows: 'Download from https://antigravity.google/download',
  },
};
