import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { warnMsg } from './branding.js';
import { writeJsonAtomic } from './fs-atomic.js';

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
    tools: {},   // { [toolId]: { addedAt } }
    files: [],   // [{ relativePath, addedAt }]
  };
}

export function readManifest(filePath) {
  if (!fs.existsSync(filePath)) return emptyManifest();
  try {
    const data = fs.readJsonSync(filePath);
    // Future migrations would go here, gated on data.version.
    return { ...emptyManifest(), ...data };
  } catch (err) {
    // A corrupt manifest must not silently read as "nothing installed" — that
    // would hide real installs from `list`/`status` and let a subsequent write
    // clobber recoverable data. Preserve the bad file and warn loudly.
    try {
      const salvage = `${filePath}.corrupt`;
      if (!fs.existsSync(salvage)) fs.copySync(filePath, salvage);
      warnMsg(`Manifest at ${filePath} is unreadable (${err.message}); preserved a copy at ${path.basename(salvage)}.`);
    } catch { /* best-effort salvage */ }
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
  writeJsonAtomic(filePath, out, { spaces: 2 });
  return out;
}

// Convenience: load → mutate → save.
export function updateManifest(filePath, mutator) {
  const m = readManifest(filePath);
  mutator(m);
  return writeManifest(filePath, m);
}

// Record system MCP installs from writeMcpConfigs result map.
// `mcpResults` is { [agentId]: { agent, added, skipped, errors, path, addedIds } }.
// We record only the IDs each agent actually merged (r.addedIds), so the manifest
// never claims servers that were skipped because they were already present.
export function recordSystemMcp(mcpResults) {
  if (!mcpResults) return;
  updateManifest(SYSTEM_MANIFEST_PATH, (m) => {
    const now = new Date().toISOString();
    for (const [agentId, r] of Object.entries(mcpResults)) {
      const ids = r.addedIds || [];
      if (ids.length === 0) continue;
      if (!m.mcp[agentId]) m.mcp[agentId] = {};
      for (const serverId of ids) {
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

export function recordSystemTools(toolResults) {
  if (!toolResults || toolResults.installed.length === 0) return;
  updateManifest(SYSTEM_MANIFEST_PATH, (m) => {
    if (!m.tools) m.tools = {};
    const now = new Date().toISOString();
    for (const toolId of toolResults.installed) {
      m.tools[toolId] = { addedAt: now };
    }
  });
}

export function recordProjectMcp(mcpResults, cwd = process.cwd()) {
  if (!mcpResults) return;
  const filePath = path.join(cwd, PROJECT_MANIFEST_PATH);
  updateManifest(filePath, (m) => {
    const now = new Date().toISOString();
    for (const [agentId, r] of Object.entries(mcpResults)) {
      const ids = r.addedIds || [];
      if (ids.length === 0) continue;
      if (!m.mcp[agentId]) m.mcp[agentId] = {};
      for (const serverId of ids) {
        m.mcp[agentId][serverId] = {
          addedAt: now,
          configPath: r.path || null,
        };
      }
      if (!m.agents.includes(agentId)) m.agents.push(agentId);
    }
  });
}

export function recordProjectSkills(skillResults, cwd = process.cwd()) {
  if (!skillResults || skillResults.installed.length === 0) return;
  const filePath = path.join(cwd, PROJECT_MANIFEST_PATH);
  updateManifest(filePath, (m) => {
    const now = new Date().toISOString();
    for (const skillName of skillResults.installed) {
      m.skills[skillName] = {
        addedAt: now,
        path: skillResults.directory,
      };
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
