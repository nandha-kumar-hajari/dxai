// Fast-path MCP commands: `dxai add <id...>` and `dxai remove <id...>`.
// No wizard — resolve target agents (from --agents or detection), validate the
// server IDs, and write/remove directly. Honours --project, --dry-run, --json,
// and --yes, matching the setup flow's conventions.

import os from 'os';
import path from 'path';

import {
  printBanner, sectionHeader, successMsg, warnMsg, infoMsg, theme,
} from './branding.js';
import { detectAgents, AGENT_DEFINITIONS } from './detect.js';
import { MCP_SERVERS } from './registry/mcp-servers.js';
import {
  writeMcpConfigs, writeProjectMcpConfigs, previewMcpConfigs,
} from './config-writer.js';
import {
  scanJsonMcpConfig, removeJsonMcpServers,
  scanTomlMcpConfig, removeTomlMcpServers,
  scanClaudeCodeMcpServers, removeClaudeCodeMcpServers,
} from './config-remover.js';
import {
  recordSystemMcp, recordProjectMcp, unrecordSystemMcp, unrecordProjectMcp,
} from './manifest.js';
import { normalizeOptions, partitionByKnown } from './runtime.js';
import { collectMcpInputs } from './index.js';

// Validate a list of IDs against a registry; throw a "Known: ..." hint on any miss.
function requireKnown(ids, knownIds, label) {
  const { valid, invalid } = partitionByKnown(ids, knownIds);
  if (invalid.length) {
    throw new Error(`Unknown ${label}: ${invalid.join(', ')}. Known: ${knownIds.join(', ')}`);
  }
  if (valid.length === 0) {
    throw new Error(`No ${label} given.`);
  }
  return valid;
}

// Which agents to target: --agents wins (validated); otherwise detected+installed.
// For --project, keep only agents that support a project-level MCP path.
function resolveTargetAgents(runtime, home, { project = false } = {}) {
  let agents;
  if (runtime.agents && runtime.agents.length) {
    const known = AGENT_DEFINITIONS.map((a) => a.id);
    const valid = requireKnown(runtime.agents, known, 'agent(s)');
    agents = AGENT_DEFINITIONS.filter((a) => valid.includes(a.id));
  } else {
    agents = detectAgents(home).filter((a) => a.installed);
  }
  if (project) agents = agents.filter((a) => typeof a.projectMcpPath === 'function');
  return agents;
}

function reportMcpResults(results, runtime, verb) {
  if (runtime.json) return;
  for (const r of Object.values(results)) {
    if (r.added > 0) successMsg(`${r.agent}: ${r.added} MCP server(s) ${verb}` + (r.path ? ` → ${r.path}` : ''));
    if (r.skipped > 0) infoMsg(`${r.agent}: ${r.skipped} already present, skipped`);
    for (const err of r.errors || []) warnMsg(`${r.agent}: ${err.id} — ${err.error}`);
  }
}

// ── dxai add <id...> ──
export async function addMcp(serverIds = [], opts = {}) {
  const runtime = normalizeOptions(opts);
  const project = !!opts.project;
  const home = os.homedir();

  const ids = requireKnown(serverIds, MCP_SERVERS.map((s) => s.id), 'MCP server(s)');
  const agents = resolveTargetAgents(runtime, home, { project });
  if (agents.length === 0) {
    throw new Error(project
      ? 'No project-capable agents. Pass --agents cursor,vscode,gemini.'
      : 'No target agents detected. Pass --agents <ids> or install a supported agent.');
  }

  const inputs = await collectMcpInputs(ids, MCP_SERVERS, runtime);

  if (!runtime.json) {
    printBanner();
    sectionHeader(`Add — ${ids.join(', ')} → ${project ? 'project' : 'system'}`);
  }

  if (runtime.dryRun && !project) {
    const previews = previewMcpConfigs(agents, ids, MCP_SERVERS, inputs);
    if (runtime.json) {
      process.stdout.write(JSON.stringify({ ok: true, dryRun: true, previews }, null, 2) + '\n');
      return;
    }
    for (const p of Object.values(previews)) {
      const tag = p.exists ? theme.dim('(merge)') : theme.dim('(create)');
      console.log(`  ${theme.label(p.agent)} ${tag} → ${p.path}`);
      if (p.wouldAdd.length) console.log(`    ${theme.success('+ would add:')} ${p.wouldAdd.join(', ')}`);
      if (p.wouldSkip.length) console.log(`    ${theme.dim('· already present:')} ${p.wouldSkip.join(', ')}`);
    }
    console.log();
    warnMsg('Dry run — no files were changed.');
    return;
  }

  if (runtime.dryRun && project) {
    if (runtime.json) {
      process.stdout.write(JSON.stringify({ ok: true, dryRun: true, project: true, wouldAdd: ids, agents: agents.map((a) => a.id) }, null, 2) + '\n');
      return;
    }
    for (const a of agents) infoMsg(`Would add ${ids.join(', ')} to ${a.name} project config (${a.projectMcpPath()})`);
    console.log();
    warnMsg('Dry run — no files were changed.');
    return;
  }

  const results = project
    ? writeProjectMcpConfigs(agents, ids, MCP_SERVERS, inputs)
    : writeMcpConfigs(agents, ids, MCP_SERVERS, inputs);
  if (project) recordProjectMcp(results); else recordSystemMcp(results);

  if (runtime.json) {
    process.stdout.write(JSON.stringify({ ok: true, added: ids, project, results }, null, 2) + '\n');
    return;
  }
  reportMcpResults(results, runtime, 'added');
  console.log();
}

// Scan one agent for which of `ids` are actually present in its config.
function scanPresent(agent, ids, home, project) {
  switch (agent.configFormat) {
    case 'json': {
      const p = project ? path.join(process.cwd(), agent.projectMcpPath()) : agent.globalMcpPath(home);
      return { path: p, present: scanJsonMcpConfig(p, agent.mcpKey, ids) };
    }
    case 'toml': {
      // TOML agents (Codex) have no project-level MCP path, so they're filtered
      // out of --project mode upstream — this branch only ever runs for global.
      const p = agent.globalMcpPath(home);
      return { path: p, present: scanTomlMcpConfig(p, ids) };
    }
    case 'cli':
      return { path: null, present: scanClaudeCodeMcpServers(ids) };
    default:
      return { path: null, present: [] };
  }
}

// Remove `ids` from one agent's config; returns the count removed.
function removeFrom(agent, ids, configPath) {
  switch (agent.configFormat) {
    case 'json':
      return removeJsonMcpServers(configPath, agent.mcpKey, ids).removed;
    case 'toml':
      return removeTomlMcpServers(configPath, ids).removed;
    case 'cli':
      return removeClaudeCodeMcpServers(ids).removed;
    default:
      return 0;
  }
}

// ── dxai remove <id...> ──
export async function removeMcp(serverIds = [], opts = {}) {
  const runtime = normalizeOptions(opts);
  const project = !!opts.project;
  const home = os.homedir();

  const ids = requireKnown(serverIds, MCP_SERVERS.map((s) => s.id), 'MCP server(s)');
  const agents = resolveTargetAgents(runtime, home, { project });
  if (agents.length === 0) {
    throw new Error('No target agents detected. Pass --agents <ids> or install a supported agent.');
  }

  if (!runtime.json) {
    printBanner();
    sectionHeader(`Remove — ${ids.join(', ')} from ${project ? 'project' : 'system'}`);
  }

  const removed = [];
  for (const agent of agents) {
    const { path: configPath, present } = scanPresent(agent, ids, home, project);
    if (present.length === 0) continue;

    if (runtime.dryRun) {
      removed.push({ agent: agent.name, agentId: agent.id, path: configPath, removed: present });
      continue;
    }

    let count = 0;
    try {
      count = removeFrom(agent, present, configPath);
    } catch (err) {
      if (!runtime.json) warnMsg(`${agent.name}: ${err.message}`);
      continue;
    }
    if (count > 0) {
      if (project) unrecordProjectMcp(agent.id, present);
      else unrecordSystemMcp(agent.id, present);
      removed.push({ agent: agent.name, agentId: agent.id, path: configPath, removed: present });
    }
  }

  if (runtime.json) {
    process.stdout.write(JSON.stringify({ ok: true, dryRun: runtime.dryRun, project, removed }, null, 2) + '\n');
    return;
  }

  if (removed.length === 0) {
    infoMsg(`None of [${ids.join(', ')}] were present in the targeted ${project ? 'project' : 'system'} configs.`);
    console.log();
    return;
  }
  for (const r of removed) {
    const verb = runtime.dryRun ? 'would remove' : 'removed';
    successMsg(`${r.agent}: ${verb} ${r.removed.join(', ')}` + (r.path ? ` → ${r.path}` : ''));
  }
  console.log();
  if (runtime.dryRun) warnMsg('Dry run — no files were changed.');
}
