import {
  fetchRegistry, writeRegistryCache, loadRegistry,
  diffRegistry, registryBaseFor,
} from './registry/loader.js';
import { validateRegistryPayload } from './registry/validate.js';
import {
  printBanner, sectionHeader, successMsg, warnMsg, errorMsg, infoMsg, theme,
} from './branding.js';

const REGISTRY_FILES = [
  { name: 'mcp-servers', listKey: 'servers' },
  { name: 'skills', listKey: 'skills' },
  { name: 'automation-tools', listKey: 'tools' },
];

// Fetch every registry file from `base`, validate shape, write the cache, and diff
// against the previously-resolved registry. Returns a results array (one per file);
// a per-file fetch/validation failure is captured as { ok: false, error } rather than
// thrown, so one bad file doesn't sink the rest. Pure of any output — callers print.
export async function refreshRegistry({ base = registryBaseFor({}), timeoutMs, retries } = {}) {
  const results = [];
  for (const { name, listKey } of REGISTRY_FILES) {
    const before = (() => {
      try { return loadRegistry(name); } catch { return null; }
    })();
    try {
      const { url, data } = await fetchRegistry(name, base, { timeoutMs, retries });
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
      const cachePath = writeRegistryCache(name, data);
      const diff = diffRegistry(before, data, listKey);
      results.push({ name, url, cachePath, ok: true, count: data[listKey].length, ...diff });
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

  const results = await refreshRegistry({ base });

  if (!json) {
    for (const r of results) {
      if (r.ok) {
        successMsg(`${r.name}: cached (${r.count} entries) → ${r.cachePath}`);
        if (r.added.length) console.log(`  ${theme.label('+ added:')} ${r.added.join(', ')}`);
        if (r.removed.length) console.log(`  ${theme.label('- removed:')} ${r.removed.join(', ')}`);
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
