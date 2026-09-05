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
function updateManifest(filePath, mutator) {
  const m = readManifest(filePath);
  mutator(m);
  return writeManifest(filePath, m);
}

// Record MCP installs from a writeMcpConfigs / writeProjectMcpConfigs result map.
// `mcpResults` is { [agentId]: { agent, added, skipped, errors, path, addedIds } }.
// Only the IDs each agent actually merged (r.addedIds) are recorded, so the
// manifest never claims servers that were skipped because they were already present.
// `meta` ({ [serverId]: { registry, requiresEnv } }) carries provenance for servers
// that are not in the bundled catalogue (added live by registry name), so
// `doctor`/`status` can still reason about them later.
function recordMcp(filePath, mcpResults, meta = {}) {
  if (!mcpResults) return;
  updateManifest(filePath, (m) => {
    const now = new Date().toISOString();
    for (const [agentId, r] of Object.entries(mcpResults)) {
      const ids = r.addedIds || [];
      if (ids.length === 0) continue;
      if (!m.mcp[agentId]) m.mcp[agentId] = {};
      for (const serverId of ids) {
        m.mcp[agentId][serverId] = { addedAt: now, configPath: r.path || null, ...(meta[serverId] || {}) };
      }
      if (!m.agents.includes(agentId)) m.agents.push(agentId);
    }
  });
}

// `skillResults.installed` holds skill IDs (which are also the on-disk
// directory names), so manifest keys line up with what cleanup scans for.
function recordSkills(filePath, skillResults) {
  if (!skillResults || skillResults.installed.length === 0) return;
  updateManifest(filePath, (m) => {
    const now = new Date().toISOString();
    for (const skillId of skillResults.installed) {
      m.skills[skillId] = { addedAt: now, path: skillResults.directory };
    }
  });
}

export function recordSystemMcp(mcpResults, meta) {
  recordMcp(SYSTEM_MANIFEST_PATH, mcpResults, meta);
}

export function recordProjectMcp(mcpResults, cwd = process.cwd(), meta) {
  recordMcp(path.join(cwd, PROJECT_MANIFEST_PATH), mcpResults, meta);
}

export function recordSystemSkills(skillResults) {
  recordSkills(SYSTEM_MANIFEST_PATH, skillResults);
}

export function recordProjectSkills(skillResults, cwd = process.cwd()) {
  recordSkills(path.join(cwd, PROJECT_MANIFEST_PATH), skillResults);
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

// Remove specific MCP server IDs for one agent from a manifest file, cleaning up
// an emptied agent bucket. No-op (and never creates the file) when the manifest
// doesn't exist. Returns the count actually removed.
export function unrecordMcp(filePath, agentId, ids) {
  if (!fs.existsSync(filePath)) return 0;
  let removed = 0;
  updateManifest(filePath, (m) => {
    if (!m.mcp[agentId]) return;
    for (const id of ids) {
      if (m.mcp[agentId][id]) { delete m.mcp[agentId][id]; removed++; }
    }
    if (Object.keys(m.mcp[agentId]).length === 0) delete m.mcp[agentId];
  });
  return removed;
}

export function unrecordSystemMcp(agentId, ids) {
  return unrecordMcp(SYSTEM_MANIFEST_PATH, agentId, ids);
}

export function unrecordProjectMcp(agentId, ids, cwd = process.cwd()) {
  return unrecordMcp(path.join(cwd, PROJECT_MANIFEST_PATH), agentId, ids);
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
