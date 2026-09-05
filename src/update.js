import {
  fetchRegistry, writeRegistryCache, loadRegistry,
  diffRegistry, registryBaseFor,
} from './registry/loader.js';
import { validateRegistryPayload } from './registry/validate.js';
import { resolveEntries } from './registry/mcp-registry.js';
import {
  printBanner, sectionHeader, successMsg, warnMsg, errorMsg, infoMsg, theme,
} from './branding.js';

const REGISTRY_FILES = [
  { name: 'mcp-servers', listKey: 'servers' },
  { name: 'skills', listKey: 'skills' },
  { name: 'automation-tools', listKey: 'tools' },
];

// Re-resolve the registry-linked MCP servers live from the official MCP
// Registry. The fetched snapshot was already resolved by the maintainer-side
// sync, so this only matters for users who want the very latest; any failure
// (offline, a bad record, a resolver problem) keeps the snapshot values.
// Returns { data, summary } where summary is null when nothing was attempted.
async function resolveLive(data, { timeoutMs, resolveFn }) {
  const { entries, results } = await resolveFn(data.servers, { timeoutMs, retries: 0 });
  if (results.length === 0) return { data, summary: null };
  const problems = validateRegistryPayload('servers', entries);
  const summary = {
    resolved: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error })),
    changed: results.filter((r) => r.ok && r.changed).map((r) => r.id),
  };
  if (problems.length) {
    summary.error = `live resolution rejected: ${problems.slice(0, 3).join('; ')}`;
    return { data, summary };
  }
  return { data: { ...data, servers: entries }, summary };
}

// Fetch every registry file from `base`, validate shape, write the cache, and diff
// against the previously-resolved registry. Returns a results array (one per file);
// a per-file fetch/validation failure is captured as { ok: false, error } rather than
// thrown, so one bad file doesn't sink the rest. Pure of any output — callers print.
// `resolve` (default true) re-resolves registry-linked MCP servers live after the
// snapshot is fetched; the background auto-refresh passes false to stay cheap.
export async function refreshRegistry({
  base = registryBaseFor({}), timeoutMs, retries, resolve = true,
  fetch = fetchRegistry, resolveFn = resolveEntries, writeCache = writeRegistryCache, loadPrev = loadRegistry,
} = {}) {
  const results = [];
  for (const { name, listKey } of REGISTRY_FILES) {
    const before = (() => {
      try { return loadPrev(name); } catch { return null; }
    })();
    try {
      let { url, data } = await fetch(name, base, { timeoutMs, retries });
      // Basic shape check — must have an array under listKey.
      if (!Array.isArray(data?.[listKey])) {
        throw new Error(`Registry payload missing "${listKey}" array`);
      }
      // Security: vet untrusted fields (ids, commands, repo/path) before caching,
      // so a poisoned/redirected registry can't seed a malicious entry that later
      // drives command execution. A bad file is rejected; bundled fallback stands.
      const problems = validateRegistryPayload(listKey, data[listKey]);
      if (problems.length) {
        throw new Error(`Registry payload failed validation: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (+${problems.length - 3} more)` : ''}`);
      }
      let live = null;
      if (name === 'mcp-servers' && resolve) {
        try {
          ({ data, summary: live } = await resolveLive(data, { timeoutMs, resolveFn }));
        } catch (err) {
          live = { resolved: 0, failed: [], changed: [], error: err.message };
        }
      }
      const cachePath = writeCache(name, data);
      const diff = diffRegistry(before, data, listKey);
      results.push({ name, url, cachePath, ok: true, count: data[listKey].length, ...diff, ...(live ? { live } : {}) });
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
    }
  }
  return results;
}

export async function updateCmd(opts = {}) {
  const json = !!opts.json;
  const base = registryBaseFor({ version: opts.registryVersion, url: opts.registryUrl });
  if (!json) {
    printBanner();
    sectionHeader('Update — refreshing registry');
    infoMsg(`Source: ${base}`);
    console.log();
  }

  const results = await refreshRegistry({ base, resolve: opts.resolve !== false });

  if (!json) {
    for (const r of results) {
      if (r.ok) {
        const liveNote = r.live ? `, ${r.live.resolved} re-resolved from the MCP Registry` : '';
        successMsg(`${r.name}: cached (${r.count} entries${liveNote}) → ${r.cachePath}`);
        if (r.added.length) console.log(`  ${theme.label('+ added:')} ${r.added.join(', ')}`);
        if (r.removed.length) console.log(`  ${theme.label('- removed:')} ${r.removed.join(', ')}`);
        if (r.live?.changed.length) console.log(`  ${theme.label('~ updated live:')} ${r.live.changed.join(', ')}`);
        if (r.live?.error) warnMsg(`${r.name}: ${r.live.error}; kept the snapshot values`);
        for (const f of r.live?.failed || []) warnMsg(`${r.name}/${f.id}: ${f.error}; kept the snapshot values`);
      } else {
        errorMsg(`${r.name}: ${r.error}`);
      }
    }
  }

  if (json) {
    process.stdout.write(JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2) + '\n');
    if (results.some((r) => !r.ok)) process.exit(1);
    return;
  }

  console.log();
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    successMsg('Registry up to date.');
  } else {
    warnMsg(`${failed.length} fetch(es) failed; using bundled fallback for those.`);
  }
  console.log();
}
