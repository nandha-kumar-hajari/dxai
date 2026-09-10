#!/usr/bin/env node
// Agent definition health check — the guard against silent vendor drift.
//
// Every entry in AGENT_DEFINITIONS (src/detect.js) is hand-verified against the
// vendor's docs and stamped with `verifiedAt`. Tools rename themselves, move
// their config files, and retire install channels far more often than dxai
// ships, so this script reports the signals that are checkable without a human:
//   1. `verifiedAt` older than the review window (default 90 days) — a nudge to
//      re-audit the entry against `docs`.
//   2. Homebrew casks (`install.brewCask`) that no longer exist, or that Homebrew
//      marks deprecated/disabled (usually a rename — the old token 404s and the
//      replacement is named in the JSON).
//   3. winget packages (`install.winget`) with no manifest directory.
//   4. `docs` URLs that are dead, or that redirect to a different host (docs
//      moved — the entry was verified against a page that no longer exists).
//
// Prints a Markdown report to stdout. Writes `has_findings=true|false` to
// $GITHUB_OUTPUT (when set) so the workflow can open an issue. Always exits 0 —
// drift is reported, not a build failure. Run locally: `node scripts/agent-health.mjs`.

import fs from 'node:fs';
import { AGENT_DEFINITIONS } from '../src/detect.js';

const TIMEOUT_MS = 10000;
const REVIEW_WINDOW_DAYS = Number(process.env.DXAI_AGENT_REVIEW_DAYS || 90);

async function fetchJson(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function brewCask(token) {
  const r = await fetchJson(`https://formulae.brew.sh/api/cask/${encodeURIComponent(token)}.json`);
  if (!r.ok) return { ok: false, detail: r.error || `HTTP ${r.status} — cask missing (renamed?)` };
  const { deprecated, deprecation_reason: why, disabled, disable_date: when } = r.data;
  if (disabled) return { ok: false, detail: `cask disabled${when ? ` on ${when}` : ''}` };
  if (deprecated) return { ok: false, detail: `cask deprecated${why ? ` (${why})` : ''}` };
  return { ok: true };
}

async function wingetPackage(id) {
  // Manifests live at manifests/<first letter>/<Publisher>/<Name...>. A 404
  // here means the id is wrong or the publisher moved (e.g. Codeium.Windsurf
  // → CognitionAI.DevinDesktop).
  const [publisher, ...rest] = id.split('.');
  const dir = `manifests/${publisher[0].toLowerCase()}/${publisher}/${rest.join('/')}`;
  const r = await fetchJson(`https://api.github.com/repos/microsoft/winget-pkgs/contents/${dir}`);
  if (r.ok) return { ok: true };
  if (r.status === 403) return { ok: true, skipped: 'GitHub API rate-limited' };
  return { ok: false, detail: r.error || `HTTP ${r.status} — no manifest at ${dir}` };
}

async function docsAlive(url) {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    }
    if (res.status === 404 || res.status === 410) return { ok: false, detail: `HTTP ${res.status}` };
    const from = new URL(url).host;
    const to = new URL(res.url).host;
    if (from !== to) return { ok: false, detail: `moved to ${to} (verify the entry against the new docs)` };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const stale = [];
const installDrift = [];
const docsDrift = [];

for (const agent of AGENT_DEFINITIONS) {
  if (!agent.verifiedAt || daysSince(agent.verifiedAt) > REVIEW_WINDOW_DAYS) {
    stale.push({ id: agent.id, verifiedAt: agent.verifiedAt || 'never', age: agent.verifiedAt ? daysSince(agent.verifiedAt) : null });
  }
  if (agent.install?.brewCask) {
    const r = await brewCask(agent.install.brewCask);
    if (!r.ok) installDrift.push({ id: agent.id, channel: `brew cask \`${agent.install.brewCask}\``, detail: r.detail });
  }
  if (agent.install?.winget) {
    const r = await wingetPackage(agent.install.winget);
    if (!r.ok) installDrift.push({ id: agent.id, channel: `winget \`${agent.install.winget}\``, detail: r.detail });
  }
  for (const url of agent.docs || []) {
    const r = await docsAlive(url);
    if (!r.ok) docsDrift.push({ id: agent.id, url, detail: r.detail });
  }
}

const lines = ['# Agent definition health report', ''];
if (!stale.length && !installDrift.length && !docsDrift.length) {
  lines.push(`✅ All agent definitions verified within ${REVIEW_WINDOW_DAYS} days; install channels and docs URLs resolve.`);
} else {
  if (stale.length) {
    lines.push(`## Definitions past the ${REVIEW_WINDOW_DAYS}-day review window`, '');
    lines.push('| Agent | Verified | Age (days) |', '| --- | --- | --- |');
    for (const s of stale) lines.push(`| ${s.id} | ${s.verifiedAt} | ${s.age ?? '—'} |`);
    lines.push('', 'Re-audit each entry against its `docs` URLs (detection names, config paths, MCP dialect, install commands) and bump `verifiedAt`.', '');
  }
  if (installDrift.length) {
    lines.push('## Install channels that moved', '');
    lines.push('| Agent | Channel | Detail |', '| --- | --- | --- |');
    for (const d of installDrift) lines.push(`| ${d.id} | ${d.channel} | ${d.detail} |`);
    lines.push('');
  }
  if (docsDrift.length) {
    lines.push('## Docs URLs that no longer resolve where they did', '');
    lines.push('| Agent | URL | Detail |', '| --- | --- | --- |');
    for (const d of docsDrift) lines.push(`| ${d.id} | ${d.url} | ${d.detail} |`);
    lines.push('');
  }
  lines.push('_See AGENTS.md → "Supported agents" for the audit checklist._');
}

const report = lines.join('\n');
console.log(report);

const hasFindings = stale.length > 0 || installDrift.length > 0 || docsDrift.length > 0;
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_findings=${hasFindings}\n`);
  fs.writeFileSync('agent-health-report.md', report);
}
