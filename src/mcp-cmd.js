// Fast-path MCP commands: `dxai add <id...>` and `dxai remove <id...>`.
// No wizard — resolve target agents (from --agents or detection), validate the
// server IDs, and write/remove directly. Honours --project, --dry-run, --json,
// and --yes, matching the setup flow's conventions.
//
// `add` also accepts official MCP Registry names (`io.github.owner/server`):
// the record is resolved live and becomes a catalogue entry for this run.

import os from 'os';
import path from 'path';

import {
  printBanner, sectionHeader, successMsg, warnMsg, infoMsg, theme, reportMcpResults,
} from './branding.js';
import { detectAgents, AGENT_DEFINITIONS } from './detect.js';
import { MCP_SERVERS, deriveConfigs } from './registry/mcp-servers.js';
import { fetchRegistryServer, pickTransport, slugForRegistryName } from './registry/mcp-registry.js';
import { isValidRegistryName, validateRegistryPayload } from './registry/validate.js';
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

const KNOWN_MCP_IDS = MCP_SERVERS.map((s) => s.id);

// Turn a live registry record into a catalogue entry for this invocation only.
// Validated like fetched catalogue data before its configs are derived.
function entryFromRegistry(name, record) {
  const r = pickTransport(record);
  if (!r.transport) throw new Error(`${name}: no usable transport (${r.warnings.join('; ')})`);
  const entry = {
    id: slugForRegistryName(name),
    name: r.title || slugForRegistryName(name),
    description: r.description || '',
    category: 'registry',
    registry: { name, resolved: { version: r.registryVersion, at: new Date().toISOString(), fields: ['transport'] } },
    transport: r.transport,
  };
  if (Object.keys(r.requiresEnv).length) entry.requiresEnv = r.requiresEnv;
  if (Object.keys(r.requiresInput).length) entry.requiresInput = r.requiresInput;
  if (r.stale) Object.assign(entry, { stale: true, staleReason: r.staleReason });
  const problems = validateRegistryPayload('servers', [entry]);
  if (problems.length) throw new Error(`${name}: ${problems.join('; ')}`);
  return { ...entry, configs: deriveConfigs(entry) };
}

// Resolve the requested servers to catalogue ids plus the server list to use.
// Catalogue ids pass through. A registry name maps to the catalogue entry that
// links to it, or is looked up live and appended as a synthetic entry. Anything
// else is unknown.
async function resolveServerList(requested) {
  const servers = [...MCP_SERVERS];
  const ids = [];
  const unknown = [];
  const live = {};
  for (const raw of requested) {
    if (KNOWN_MCP_IDS.includes(raw)) { ids.push(raw); continue; }
    if (!isValidRegistryName(raw)) { unknown.push(raw); continue; }
    const linked = MCP_SERVERS.find((s) => s.registry?.name === raw);
    if (linked) { ids.push(linked.id); continue; }
    const slug = slugForRegistryName(raw);
    if (KNOWN_MCP_IDS.includes(slug)) {
      throw new Error(`${raw} would use the id "${slug}", which already names a different catalogue server. Use the catalogue id instead.`);
    }
    if (live[slug]) { ids.push(slug); continue; }
    const record = await fetchRegistryServer(raw);
    if (!record) throw new Error(`Not found in the MCP Registry: ${raw}`);
    const entry = entryFromRegistry(raw, record);
    servers.push(entry);
    live[slug] = { registry: raw, requiresEnv: Object.keys(entry.requiresEnv || {}) };
    ids.push(slug);
  }
  if (unknown.length) {
    throw new Error(`Unknown MCP server(s): ${unknown.join(', ')}. Known: ${KNOWN_MCP_IDS.join(', ')} (or an MCP Registry name like io.github.owner/server)`);
  }
  if (ids.length === 0) throw new Error('No MCP server(s) given.');
  return { ids: [...new Set(ids)], servers, live };
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

// ── dxai add <id...> ──
export async function addMcp(serverIds = [], opts = {}) {
  const runtime = normalizeOptions(opts);
  const project = !!opts.project;
  const home = os.homedir();

  const { ids, servers, live } = await resolveServerList(serverIds);
  const agents = resolveTargetAgents(runtime, home, { project });
  if (agents.length === 0) {
    throw new Error(project
      ? `No project-capable agents. Pass --agents with one of: ${AGENT_DEFINITIONS.filter((a) => a.projectMcpPath).map((a) => a.id).join(', ')}.`
      : 'No target agents detected. Pass --agents <ids> or install a supported agent.');
  }

  const inputs = await collectMcpInputs(ids, servers, runtime);

  if (!runtime.json) {
    printBanner();
    sectionHeader(`Add — ${ids.join(', ')} → ${project ? 'project' : 'system'}`);
  }

  if (runtime.dryRun && !project) {
    const previews = previewMcpConfigs(agents, ids, servers, inputs);
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
    ? writeProjectMcpConfigs(agents, ids, servers, inputs)
    : writeMcpConfigs(agents, ids, servers, inputs);
  if (project) recordProjectMcp(results, undefined, live); else recordSystemMcp(results, live);

  // Per-agent write failures land in results[*].errors — exit non-zero so
  // scripted callers can detect a partial failure.
  const errorCount = Object.values(results).reduce((n, r) => n + (r.errors || []).length, 0);
  if (errorCount > 0) process.exitCode = 1;

  if (runtime.json) {
    process.stdout.write(JSON.stringify({ ok: errorCount === 0, added: ids, project, results }, null, 2) + '\n');
    return;
  }
  reportMcpResults(results);
  console.log();
}

// Scan one agent for which of `ids` are actually present in its config.
function scanPresent(agent, ids, home, project) {
  if (project) {
    const p = path.join(process.cwd(), agent.projectMcpPath());
    const format = agent.projectConfigFormat || agent.configFormat;
    return format === 'toml'
      ? { path: p, present: scanTomlMcpConfig(p, ids) }
      : { path: p, present: scanJsonMcpConfig(p, agent.projectMcpKey || agent.mcpKey, ids) };
  }
  switch (agent.configFormat) {
    case 'json': {
      const p = agent.globalMcpPath(home);
      return { path: p, present: scanJsonMcpConfig(p, agent.mcpKey, ids) };
    }
    case 'toml': {
      const p = agent.globalMcpPath(home);
      return { path: p, present: scanTomlMcpConfig(p, ids) };
    }
    case 'cli':
      return { path: null, present: scanClaudeCodeMcpServers(ids) };
    default:
      return { path: null, present: [] };
  }
}

// Remove `ids` from one agent's config; returns the count removed. The
// project-level file can use a different format/key than the global config
// (Claude Code: `claude mcp remove` globally, `.mcp.json` in a project), so
// --project must be honoured here exactly as scanPresent does — otherwise a
// project removal would silently hit the user's global config instead.
function removeFrom(agent, ids, configPath, { project = false } = {}) {
  const format = project ? (agent.projectConfigFormat || agent.configFormat) : agent.configFormat;
  const key = project ? (agent.projectMcpKey || agent.mcpKey) : agent.mcpKey;
  // A project file dxai emptied out is deleted rather than left as `{}`.
  const opts = { removeIfEmpty: project };
  switch (format) {
    case 'json':
      return removeJsonMcpServers(configPath, key, ids, opts).removed;
    case 'toml':
      return removeTomlMcpServers(configPath, ids, opts).removed;
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

  // Removal is by catalogue id or the slug a registry name was added under;
  // no live lookup is needed to take something out of a config.
  const ids = serverIds.map((raw) => (isValidRegistryName(raw) ? slugForRegistryName(raw) : raw));
  if (ids.length === 0) throw new Error('No MCP server(s) given.');
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

    let count;
    try {
      count = removeFrom(agent, present, configPath, { project });
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
