// MCP server registry — data lives in data/mcp-servers.json.
// At import time we use the cache (if present) or fall back to bundled JSON.
// Run `dxai update` to refresh the cache from a remote source.

import { loadRegistry } from './loader.js';

const data = loadRegistry('mcp-servers');

export const MCP_CATEGORIES = data.categories;
export const MCP_SERVERS = data.servers;

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
