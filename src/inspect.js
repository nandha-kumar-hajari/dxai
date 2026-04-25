import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

import {
  printBanner, sectionHeader, successMsg, warnMsg, errorMsg, infoMsg, theme,
} from './branding.js';
import { detectOS, AGENT_DEFINITIONS } from './detect.js';
import { MCP_SERVERS } from './registry/mcp-servers.js';
import {
  readManifest, SYSTEM_MANIFEST_PATH, PROJECT_MANIFEST_PATH,
} from './manifest.js';
import {
  scanJsonMcpConfig, scanTomlMcpConfig, scanClaudeCodeMcpServers,
} from './config-remover.js';

const HOME = os.homedir();

function loadBoth(cwd = process.cwd()) {
  const system = readManifest(SYSTEM_MANIFEST_PATH);
  const project = readManifest(path.join(cwd, PROJECT_MANIFEST_PATH));
  return { system, project };
}

// ── list ──────────────────────────────────────
export async function listCmd(opts = {}) {
  const { system, project } = loadBoth();

  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: true, system, project }, null, 2) + '\n');
    return;
  }

  printBanner();

  sectionHeader('System (~/.dxai/manifest.json)');
  if (system.agents.length === 0 && Object.keys(system.mcp).length === 0 && Object.keys(system.skills).length === 0) {
    infoMsg('No system-level dxai installs recorded.');
  } else {
    if (system.agents.length > 0) successMsg(`Agents: ${system.agents.join(', ')}`);
    for (const [agentId, servers] of Object.entries(system.mcp)) {
      const list = Object.keys(servers).join(', ');
      console.log(`  ${theme.label(agentId.padEnd(14))} ${theme.dim('MCP:')} ${list}`);
    }
    if (Object.keys(system.skills).length > 0) {
      console.log(`  ${theme.label('skills'.padEnd(14))} ${theme.dim('→')} ${Object.keys(system.skills).join(', ')}`);
    }
  }

  console.log();
  sectionHeader('Project (./.dxai/manifest.json)');
  if (project.agents.length === 0 && Object.keys(project.mcp).length === 0 && project.files.length === 0) {
    infoMsg('No project-level dxai installs recorded in cwd.');
  } else {
    if (project.agents.length > 0) successMsg(`Agents: ${project.agents.join(', ')}`);
    for (const [agentId, servers] of Object.entries(project.mcp)) {
      const list = Object.keys(servers).join(', ');
      console.log(`  ${theme.label(agentId.padEnd(14))} ${theme.dim('MCP:')} ${list}`);
    }
    if (project.files.length > 0) {
      console.log(`  ${theme.label('files'.padEnd(14))} ${theme.dim('→')} ${project.files.map((f) => f.relativePath).join(', ')}`);
    }
  }
  console.log();
}

// ── status ─────────────────────────────────────
// Diff manifest vs actual config files. Reports drift.
function readActualMcp(agent, home, cwd) {
  const out = { global: [], project: [] };

  if (agent.configFormat === 'json' && typeof agent.globalMcpPath === 'function') {
    out.global = scanJsonMcpConfig(agent.globalMcpPath(home), agent.mcpKey, MCP_SERVERS.map((s) => s.id));
  } else if (agent.configFormat === 'toml' && typeof agent.globalMcpPath === 'function') {
    out.global = scanTomlMcpConfig(agent.globalMcpPath(home), MCP_SERVERS.map((s) => s.id));
  } else if (agent.configFormat === 'cli') {
    out.global = scanClaudeCodeMcpServers(MCP_SERVERS.map((s) => s.id));
  }

  if (typeof agent.projectMcpPath === 'function') {
    const projPath = path.join(cwd, agent.projectMcpPath());
    if (fs.existsSync(projPath)) {
      out.project = scanJsonMcpConfig(projPath, agent.mcpKey, MCP_SERVERS.map((s) => s.id));
    }
  }

  return out;
}

export async function statusCmd(opts = {}) {
  const { home } = detectOS();
  const cwd = process.cwd();
  const { system, project } = loadBoth(cwd);

  const drift = { system: {}, project: {} };

  for (const agent of AGENT_DEFINITIONS) {
    const recordedSystem = Object.keys(system.mcp[agent.id] || {});
    const recordedProject = Object.keys(project.mcp[agent.id] || {});
    if (recordedSystem.length === 0 && recordedProject.length === 0) continue;

    const actual = readActualMcp(agent, home, cwd);

    // Missing: in manifest but not in config (someone removed it).
    // Extra: in config but not in manifest (added outside dxai or by another tool).
    const sysMissing = recordedSystem.filter((id) => !actual.global.includes(id));
    const sysExtra = actual.global.filter((id) => !recordedSystem.includes(id));
    const projMissing = recordedProject.filter((id) => !actual.project.includes(id));
    const projExtra = actual.project.filter((id) => !recordedProject.includes(id));

    if (sysMissing.length || sysExtra.length) {
      drift.system[agent.id] = { missing: sysMissing, extra: sysExtra };
    }
    if (projMissing.length || projExtra.length) {
      drift.project[agent.id] = { missing: projMissing, extra: projExtra };
    }
  }

  // Project files: did manifest-recorded files actually survive?
  const fileDrift = [];
  for (const f of project.files || []) {
    const abs = path.join(cwd, f.relativePath);
    if (!fs.existsSync(abs)) fileDrift.push(f.relativePath);
  }

  const clean =
    Object.keys(drift.system).length === 0 &&
    Object.keys(drift.project).length === 0 &&
    fileDrift.length === 0;

  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: true, clean, drift, fileDrift }, null, 2) + '\n');
    return;
  }

  printBanner();
  sectionHeader('Status — Manifest vs Actual Config');

  if (clean) {
    console.log();
    successMsg('In sync. Manifest and live config agree.');
    console.log();
    return;
  }

  for (const [agentId, d] of Object.entries(drift.system)) {
    console.log();
    console.log(theme.label(`  System / ${agentId}`));
    if (d.missing.length) warnMsg(`Missing in config (manifest expected): ${d.missing.join(', ')}`);
    if (d.extra.length) infoMsg(`Extra in config (not added by dxai): ${d.extra.join(', ')}`);
  }
  for (const [agentId, d] of Object.entries(drift.project)) {
    console.log();
    console.log(theme.label(`  Project / ${agentId}`));
    if (d.missing.length) warnMsg(`Missing in config (manifest expected): ${d.missing.join(', ')}`);
    if (d.extra.length) infoMsg(`Extra in config (not added by dxai): ${d.extra.join(', ')}`);
  }
  if (fileDrift.length > 0) {
    console.log();
    console.log(theme.label('  Project files'));
    warnMsg(`Removed since install: ${fileDrift.join(', ')}`);
  }
  console.log();
}

// ── doctor ─────────────────────────────────────
// Validate that configs parse, env vars are set, and (best-effort) MCP commands exist.
export async function doctorCmd(opts = {}) {
  const { home } = detectOS();
  const cwd = process.cwd();
  const { system, project } = loadBoth(cwd);

  const findings = [];
  const ok = (msg) => findings.push({ severity: 'ok', msg });
  const warn = (msg) => findings.push({ severity: 'warn', msg });
  const fail = (msg) => findings.push({ severity: 'error', msg });

  // 1. Config files parse.
  for (const agent of AGENT_DEFINITIONS) {
    if (typeof agent.globalMcpPath !== 'function') continue;
    if (agent.configFormat === 'cli') continue; // no file to parse
    const p = agent.globalMcpPath(home);
    if (!fs.existsSync(p)) continue;

    if (agent.configFormat === 'json') {
      try {
        fs.readJsonSync(p);
        ok(`${agent.name}: config parses (${p})`);
      } catch (err) {
        fail(`${agent.name}: config malformed at ${p} — ${err.message}`);
      }
    } else if (agent.configFormat === 'toml') {
      try {
        fs.readFileSync(p, 'utf-8'); // shallow check; deeper TOML parse optional
        ok(`${agent.name}: config readable (${p})`);
      } catch (err) {
        fail(`${agent.name}: config unreadable at ${p} — ${err.message}`);
      }
    }
  }

  // 2. Env vars for installed servers.
  const installedIds = new Set();
  for (const servers of Object.values(system.mcp)) Object.keys(servers).forEach((id) => installedIds.add(id));
  for (const servers of Object.values(project.mcp)) Object.keys(servers).forEach((id) => installedIds.add(id));

  for (const id of installedIds) {
    const meta = MCP_SERVERS.find((s) => s.id === id);
    if (!meta || !meta.requiresEnv) continue;
    for (const [envVar, desc] of Object.entries(meta.requiresEnv)) {
      if (process.env[envVar]) ok(`env: ${envVar} set (${meta.name})`);
      else warn(`env: ${envVar} not set — needed by ${meta.name} (${desc})`);
    }
  }

  // 3. Tools available on PATH for installed servers (heuristic — only npx-based).
  let npxAvailable = true;
  try {
    execSync(os.platform() === 'win32' ? 'where npx' : 'command -v npx', { stdio: 'pipe' });
  } catch {
    npxAvailable = false;
    fail('npx not found on PATH — most MCP servers spawn via `npx`.');
  }
  if (npxAvailable) ok('npx is on PATH');

  // 4. Project files referenced in manifest still exist.
  for (const f of project.files || []) {
    const abs = path.join(cwd, f.relativePath);
    if (fs.existsSync(abs)) ok(`project file present: ${f.relativePath}`);
    else warn(`project file missing: ${f.relativePath} (recorded in manifest)`);
  }

  const summary = {
    ok: findings.filter((f) => f.severity === 'ok').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    error: findings.filter((f) => f.severity === 'error').length,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: summary.error === 0, summary, findings }, null, 2) + '\n');
    if (summary.error > 0) process.exit(1);
    return;
  }

  printBanner();
  sectionHeader('Doctor — Health Check');
  console.log();
  for (const f of findings) {
    if (f.severity === 'ok') successMsg(f.msg);
    else if (f.severity === 'warn') warnMsg(f.msg);
    else errorMsg(f.msg);
  }
  console.log();
  infoMsg(`${summary.ok} ok · ${summary.warn} warn · ${summary.error} error`);
  console.log();
  if (summary.error > 0) process.exit(1);
}
