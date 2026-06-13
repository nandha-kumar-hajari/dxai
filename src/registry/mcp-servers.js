// MCP server registry — data lives in data/mcp-servers.json.
// At import time we use the cache (if present) or fall back to bundled JSON.
// Run `dxai update` to refresh the cache from a remote source.

import { loadRegistry } from './loader.js';
import { AGENT_DEFINITIONS, renderAgentConfig, MCP_CONFIG_ALIASES } from '../detect.js';

const data = loadRegistry('mcp-servers');

// Expand legacy config-key aliases (e.g. `antigravity` → the IDE + CLI agents)
// in place, without clobbering an explicit per-agent key if one already exists.
function expandAliases(configs) {
  for (const [alias, targets] of Object.entries(MCP_CONFIG_ALIASES)) {
    if (!(alias in configs)) continue;
    for (const target of targets) {
      if (!(target in configs)) configs[target] = configs[alias];
    }
    delete configs[alias];
  }
  return configs;
}

// Resolve a server's effective per-agent configs. A server may declare a
// canonical `transport` (derived into a block for every agent that has a
// dialect) and/or explicit per-agent `configs`. Explicit configs win on a
// per-agent basis, so they remain an escape hatch for servers that don't fit
// the common shapes. A server with neither transport nor configs resolves to {}.
export function deriveConfigs(server, agents = AGENT_DEFINITIONS) {
  const derived = {};
  if (server.transport) {
    for (const agent of agents) {
      const cfg = renderAgentConfig(agent, server);
      if (cfg) derived[agent.id] = cfg;
    }
  }
  return expandAliases({ ...derived, ...(server.configs || {}) });
}

export const MCP_CATEGORIES = data.categories;
export const MCP_SERVERS = data.servers.map((server) => ({
  ...server,
  configs: deriveConfigs(server),
}));

export function getServersByCategory() {
  const grouped = {};
  for (const cat of MCP_CATEGORIES) {
    grouped[cat.id] = {
      ...cat,
      servers: MCP_SERVERS.filter((s) => s.category === cat.id),
    };
  }
  return grouped;
}

// Helper: build choices for inquirer (kept for any external callers; the main
// flow in src/index.js builds choices inline so it can apply chalk styling).
export function buildMcpChoices(selectedAgents) {
  const grouped = getServersByCategory();
  const choices = [];

  for (const cat of MCP_CATEGORIES) {
    const servers = grouped[cat.id]?.servers || [];
    const available = servers.filter((s) =>
      selectedAgents.some((agentId) => s.configs[agentId])
    );
    if (available.length === 0) continue;

    choices.push({ type: 'separator', line: `\n  ${cat.label}  ${cat.description}` });
    for (const s of available) {
      const rec = s.recommended ? ' ★' : '';
      const envNote = s.requiresEnv ? ' (needs API key)' : '';
      choices.push({
        name: `${s.name}${rec} — ${s.description}${envNote}`,
        value: s.id,
        checked: !!s.recommended,
      });
    }
  }
  return choices;
}
