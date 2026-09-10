// MCP server registry — data lives in data/mcp-servers.json.
// At import time we use the cache (if present) or fall back to bundled JSON.
// Run `dxai update` to refresh the cache from a remote source.

import { loadRegistry } from './loader.js';
import { AGENT_DEFINITIONS, renderAgentConfig, MCP_CONFIG_ALIASES, normalizeAgentIds } from '../detect.js';

const data = loadRegistry('mcp-servers');

// Expand config-key aliases (e.g. `antigravity` → every Antigravity agent) in
// place, without clobbering an explicit per-agent key if one already exists. An
// alias may share its name with a real agent id, in which case that agent keeps
// the block and the other targets receive a copy.
function expandAliases(configs) {
  for (const [alias, targets] of Object.entries(MCP_CONFIG_ALIASES)) {
    if (!(alias in configs)) continue;
    const block = configs[alias];
    if (!targets.includes(alias)) delete configs[alias];
    for (const target of targets) {
      if (!(target in configs)) configs[target] = block;
    }
  }
  return configs;
}

// Resolve a server's effective per-agent configs. A server may declare a
// canonical `transport` (derived into a block for every agent that has a
// dialect) and/or explicit per-agent `configs`. Explicit configs win on a
// per-agent basis, so they remain an escape hatch for servers that don't fit
// the common shapes. A server with neither transport nor configs resolves to {}.
// A server may opt specific agents out of derivation (e.g. "Claude Code as an
// MCP server" makes no sense inside Claude Code itself).
function isExcluded(server, agentId) {
  return normalizeAgentIds(server.excludeAgents).includes(agentId);
}

export function deriveConfigs(server, agents = AGENT_DEFINITIONS) {
  const derived = {};
  if (server.transport) {
    for (const agent of agents) {
      if (isExcluded(server, agent.id)) continue;
      const cfg = renderAgentConfig(agent, server);
      if (cfg) derived[agent.id] = cfg;
    }
  }
  return expandAliases({ ...derived, ...(server.configs || {}) });
}

// Per-agent blocks for the *project-level* file. Agents whose project file uses
// a different dialect from their global config (Claude Code: CLI globally,
// .mcp.json in projects) are rendered from `transport` with that dialect;
// everyone else reuses their global block.
export function deriveProjectConfigs(server, configs, agents = AGENT_DEFINITIONS) {
  const out = {};
  for (const agent of agents) {
    if (typeof agent.projectMcpPath !== 'function') continue;
    if (agent.projectMcpDialect) {
      if (!server.transport || isExcluded(server, agent.id)) continue;
      const cfg = renderAgentConfig(agent, server, { project: true });
      if (cfg) out[agent.id] = cfg;
    } else if (configs[agent.id]) {
      out[agent.id] = configs[agent.id];
    }
  }
  return out;
}

export const MCP_CATEGORIES = data.categories;
export const MCP_SERVERS = data.servers.map((server) => {
  const configs = deriveConfigs(server);
  return { ...server, configs, projectConfigs: deriveProjectConfigs(server, configs) };
});
