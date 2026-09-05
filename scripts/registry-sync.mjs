#!/usr/bin/env node
// Registry sync — keeps the bundled MCP catalogue current from the official
// MCP Registry (registry.modelcontextprotocol.io).
//
// For every catalogue entry that carries a `registry.name`, fetch the latest
// record, map it onto dxai fields (src/registry/mcp-registry.js) and rewrite
// the entry's resolver-owned fields. Entries without a `registry` block are
// left alone, but the registry is searched for likely vendor records so
// migration candidates surface in the report.
//
// Prints a Markdown report to stdout. Rewrites src/registry/data/mcp-servers.json
// only when at least one entry actually changed (timestamps alone never
// cause a write, so `registry.resolved.at` reads as "last changed"). Writes
// `has_changes=true|false` to $GITHUB_OUTPUT (when set) so the workflow can
// open a PR. `--dry-run` reports without writing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEntries, fetchRegistrySearch } from '../src/registry/mcp-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.resolve(__dirname, '..', 'src', 'registry', 'data', 'mcp-servers.json');
const dryRun = process.argv.includes('--dry-run');

// Stable key order so a sync produces a minimal, reviewable diff.
const KEY_ORDER = [
  'id', 'name', 'description', 'category', 'recommended', 'stale', 'staleReason',
  'registry', 'version', 'requiresEnv', 'requiresInput', 'transport', 'configs',
];
function orderEntry(entry) {
  const out = {};
  for (const k of KEY_ORDER) if (k in entry) out[k] = entry[k];
  for (const k of Object.keys(entry)) if (!(k in out)) out[k] = entry[k];
  return out;
}

function describeTransport(t) {
  if (!t) return '—';
  if (t.type === 'http') return `http ${t.url}`;
  return `${t.command} ${(t.args || []).join(' ')}`;
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const byId = new Map(data.servers.map((s) => [s.id, s]));

const { entries, results } = await resolveEntries(data.servers, { concurrency: 4, retries: 1 });

// Keep the previous timestamp on entries that did not change.
for (const r of results) {
  if (!r.ok || r.changed) continue;
  const idx = entries.findIndex((e) => e.id === r.id);
  const prevAt = byId.get(r.id)?.registry?.resolved?.at;
  if (idx !== -1 && prevAt) entries[idx].registry.resolved.at = prevAt;
}

// Migration candidates for explicit entries. Aggregators re-publish other
// people's servers under their own namespace; they are never the vendor record.
const AGGREGATORS = ['ai.smithery/', 'com.pulsemcp/', 'com.mcparmory/', 'ai.waystation/', 'io.github.mcp-dir/', 'io.github.pipeworx-io/'];
const candidates = [];
for (const entry of data.servers.filter((s) => !s.registry?.name)) {
  let hits = [];
  try { hits = await fetchRegistrySearch(entry.id, { limit: 10, retries: 0 }); } catch { /* offline: no hints */ }
  const names = hits
    .map((h) => h.server?.name)
    .filter((n) => n && !AGGREGATORS.some((a) => n.startsWith(a)) && n.toLowerCase().includes(entry.id))
    .slice(0, 5);
  if (names.length) candidates.push({ id: entry.id, names });
}

const changed = results.filter((r) => r.ok && r.changed);
const failed = results.filter((r) => !r.ok);
const warned = results.filter((r) => r.warnings?.length);

const lines = ['# Registry sync report', ''];
lines.push(`Resolved ${results.filter((r) => r.ok).length}/${results.length} registry-linked entries; ${changed.length} changed.`, '');

if (changed.length) {
  lines.push('## Changed', '', '| Server | Registry | Source | Transport |', '| --- | --- | --- | --- |');
  for (const r of changed) {
    const e = entries.find((x) => x.id === r.id);
    lines.push(`| ${r.id} | \`${r.name}\` (v${r.version}) | ${r.source} | \`${describeTransport(e.transport)}\` |`);
  }
  lines.push('');
}
if (failed.length) {
  lines.push('## Not resolved (entry kept as-is)', '', '| Server | Registry | Error |', '| --- | --- | --- |');
  for (const r of failed) lines.push(`| ${r.id} | \`${r.name}\` | ${r.error} |`);
  lines.push('');
}
if (warned.length) {
  lines.push('## Warnings', '');
  for (const r of warned) for (const w of r.warnings) lines.push(`- **${r.id}**: ${w}`);
  lines.push('');
}
if (candidates.length) {
  lines.push('## Migration candidates (explicit entries with registry hits)', '');
  for (const c of candidates) lines.push(`- **${c.id}**: ${c.names.map((n) => `\`${n}\``).join(', ')}`);
  lines.push('');
}
if (!changed.length && !failed.length) lines.push('✅ Catalogue is in sync with the registry.');

const report = lines.join('\n');
console.log(report);

if (changed.length && !dryRun) {
  data.servers = entries.map(orderEntry);
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(process.cwd(), DATA_PATH)}`);
} else if (changed.length) {
  console.log('\n(dry run — nothing written)');
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_changes=${changed.length > 0}\n`);
  fs.writeFileSync('registry-sync-report.md', report);
}
