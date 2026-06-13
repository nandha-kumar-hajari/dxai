#!/usr/bin/env node
// Catalogue health check — the "automate" half of the pin-minimally policy.
//
// Walks the resolved MCP catalogue and reports two kinds of rot that otherwise
// accumulate silently between releases:
//   1. Pinned `version`s that have drifted from the npm `latest` tag.
//   2. HTTP server URLs that no longer resolve.
//
// Prints a Markdown report to stdout. Writes `has_findings=true|false` to
// $GITHUB_OUTPUT (when set) so the workflow can decide whether to open an issue.
// Always exits 0 — health drift is reported, not a build failure.

import fs from 'node:fs';
import { MCP_SERVERS } from '../src/registry/mcp-servers.js';

const TIMEOUT_MS = 10000;

// Collect npm package specs and http(s) URLs referenced by a server, scanning
// its canonical transport and any explicit per-agent config blocks.
function inspectServer(server) {
  const packages = new Set();
  const urls = new Set();

  const considerArgs = (command, args) => {
    const list = args || [];
    // Only tokens after the `npx` anchor are packages — never the `mcp add <id> --`
    // prefix of a `claude mcp add` argv. Mirrors config-writer.js#pinArgs.
    const npxIdx = list.indexOf('npx');
    const start = command === 'npx' ? 0 : npxIdx === -1 ? -1 : npxIdx + 1;
    if (start === -1) return;
    for (let i = start; i < list.length; i++) {
      const tok = list[i];
      if (typeof tok !== 'string' || tok.startsWith('-') || tok === 'npx') continue;
      if (/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(tok)) { packages.add(tok); break; }
    }
  };

  if (server.transport?.type === 'http' && server.transport.url) urls.add(server.transport.url);
  if (server.transport?.type === 'stdio') considerArgs(server.transport.command, server.transport.args);

  for (const cfg of Object.values(server.configs || {})) {
    if (!cfg || typeof cfg !== 'object') continue;
    for (const v of Object.values(cfg)) {
      if (typeof v === 'string' && /^https?:\/\//.test(v)) urls.add(v);
    }
    if (Array.isArray(cfg.args)) considerArgs(cfg.command, cfg.args);
    if (typeof cfg.toml === 'string') {
      const m = cfg.toml.match(/url = "(https?:\/\/[^"]+)"/);
      if (m) urls.add(m[1]);
    }
  }
  return { packages: [...packages], urls: [...urls] };
}

async function npmLatest(pkg) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg.replace('/', '%2F')}/latest`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, version: data.version };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function urlAlive(url) {
  // MCP HTTP endpoints routinely answer a bare request with 400/401/405/406
  // (they want POST + auth + specific headers). Any HTTP response proves the host
  // is up; only a network failure or a definitive 404/410 means the URL is gone.
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    }
    const gone = res.status === 404 || res.status === 410;
    return { ok: !gone, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const pinDrift = [];
const deadUrls = [];
const checkedUrls = new Set();

for (const server of MCP_SERVERS) {
  const { packages, urls } = inspectServer(server);

  if (server.version) {
    for (const pkg of packages) {
      const latest = await npmLatest(pkg);
      if (latest.ok && latest.version !== server.version) {
        pinDrift.push({ id: server.id, pkg, pinned: server.version, latest: latest.version });
      }
    }
  }

  for (const url of urls) {
    if (checkedUrls.has(url)) continue;
    checkedUrls.add(url);
    const alive = await urlAlive(url);
    if (!alive.ok) {
      deadUrls.push({ id: server.id, url, detail: alive.error || `HTTP ${alive.status}` });
    }
  }
}

const lines = ['# Catalogue health report', ''];
if (!pinDrift.length && !deadUrls.length) {
  lines.push('✅ All pinned versions current and all server URLs reachable.');
} else {
  if (pinDrift.length) {
    lines.push('## Pinned versions behind npm `latest`', '');
    lines.push('| Server | Package | Pinned | Latest |', '| --- | --- | --- | --- |');
    for (const d of pinDrift) lines.push(`| ${d.id} | \`${d.pkg}\` | ${d.pinned} | ${d.latest} |`);
    lines.push('');
  }
  if (deadUrls.length) {
    lines.push('## Unreachable server URLs', '');
    lines.push('| Server | URL | Detail |', '| --- | --- | --- |');
    for (const d of deadUrls) lines.push(`| ${d.id} | ${d.url} | ${d.detail} |`);
    lines.push('');
  }
  lines.push('_Pin policy: pin minimally; bump or drop the pin, or fix the URL._');
}

const report = lines.join('\n');
console.log(report);

const hasFindings = pinDrift.length > 0 || deadUrls.length > 0;
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_findings=${hasFindings}\n`);
  fs.writeFileSync('catalog-health-report.md', report);
}
