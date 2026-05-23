import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const HOME = os.homedir();

export const SYSTEM_MANIFEST_PATH = path.join(HOME, '.dxai', 'manifest.json');
export const PROJECT_MANIFEST_PATH = path.join('.dxai', 'manifest.json');
export const MANIFEST_VERSION = 1;

export function emptyManifest() {
  return {
    version: MANIFEST_VERSION,
    createdAt: null,
    updatedAt: null,
    agents: [],
    mcp: {},     // { [agentId]: { [serverId]: { addedAt, configPath } } }
    skills: {},  // { [skillId]: { addedAt, path } }
    files: [],   // [{ relativePath, addedAt }]
  };
}

export function readManifest(filePath) {
  if (!fs.existsSync(filePath)) return emptyManifest();
  try {
    const data = fs.readJsonSync(filePath);
    // Future migrations would go here, gated on data.version.
    return { ...emptyManifest(), ...data };
  } catch {
    return emptyManifest();
  }
}

export function writeManifest(filePath, manifest) {
  const now = new Date().toISOString();
  const out = {
    ...manifest,
    version: MANIFEST_VERSION,
    createdAt: manifest.createdAt || now,
    updatedAt: now,
  };
  fs.ensureDirSync(path.dirname(filePath));
  fs.writeJsonSync(filePath, out, { spaces: 2 });
  return out;
}

// Convenience: load → mutate → save.
export function updateManifest(filePath, mutator) {
  const m = readManifest(filePath);
  mutator(m);
  return writeManifest(filePath, m);
}

// Record system MCP installs from writeMcpConfigs result map.
// `mcpResults` is { [agentId]: { agent, added, skipped, errors, path } }
export function recordSystemMcp(mcpResults, addedServerIds) {
  if (!mcpResults) return;
  updateManifest(SYSTEM_MANIFEST_PATH, (m) => {
    const now = new Date().toISOString();
    for (const [agentId, r] of Object.entries(mcpResults)) {
      if (r.added <= 0) continue;
      if (!m.mcp[agentId]) m.mcp[agentId] = {};
      for (const serverId of addedServerIds) {
        // We don't know per-server which ones were actually new vs skipped here,
        // so we only record IDs the caller marked as freshly added.
        m.mcp[agentId][serverId] = {
          addedAt: now,
          configPath: r.path || null,
        };
      }
      if (!m.agents.includes(agentId)) m.agents.push(agentId);
    }
  });
}

export function recordSystemSkills(skillResults) {
  if (!skillResults || skillResults.installed.length === 0) return;
  updateManifest(SYSTEM_MANIFEST_PATH, (m) => {
    const now = new Date().toISOString();
    for (const skillName of skillResults.installed) {
      m.skills[skillName] = {
        addedAt: now,
        path: skillResults.directory,
      };
    }
  });
}

export function recordProjectMcp(mcpResults, addedServerIds, cwd = process.cwd()) {
  if (!mcpResults) return;
  const filePath = path.join(cwd, PROJECT_MANIFEST_PATH);
  updateManifest(filePath, (m) => {
    const now = new Date().toISOString();
    for (const [agentId, r] of Object.entries(mcpResults)) {
      if (r.added <= 0) continue;
      if (!m.mcp[agentId]) m.mcp[agentId] = {};
      for (const serverId of addedServerIds) {
        m.mcp[agentId][serverId] = {
          addedAt: now,
          configPath: r.path || null,
        };
      }
      if (!m.agents.includes(agentId)) m.agents.push(agentId);
    }
  });
}

export function recordProjectFiles(filePaths, cwd = process.cwd()) {
  if (!filePaths || filePaths.length === 0) return;
  const filePath = path.join(cwd, PROJECT_MANIFEST_PATH);
  updateManifest(filePath, (m) => {
    const now = new Date().toISOString();
    const have = new Set(m.files.map((f) => f.relativePath));
    for (const rel of filePaths) {
      if (!have.has(rel)) {
        m.files.push({ relativePath: rel, addedAt: now });
      }
    }
  });
}
