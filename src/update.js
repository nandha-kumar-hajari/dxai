import {
  fetchRegistry, writeRegistryCache, loadRegistry,
  diffRegistry, DEFAULT_REGISTRY_BASE,
} from './registry/loader.js';
import {
  printBanner, sectionHeader, successMsg, warnMsg, errorMsg, infoMsg, theme,
} from './branding.js';

const REGISTRY_FILES = [
  { name: 'mcp-servers', listKey: 'servers' },
  { name: 'skills', listKey: 'skills' },
];

export async function updateCmd(opts = {}) {
  const json = !!opts.json;
  if (!json) {
    printBanner();
    sectionHeader('Update — refreshing registry');
    infoMsg(`Source: ${DEFAULT_REGISTRY_BASE}`);
    console.log();
  }

  const results = [];

  for (const { name, listKey } of REGISTRY_FILES) {
    const before = (() => {
      try { return loadRegistry(name); } catch { return null; }
    })();
    try {
      const { url, data } = await fetchRegistry(name);
      // Basic shape check — must have an array under listKey.
      if (!Array.isArray(data?.[listKey])) {
        throw new Error(`Registry payload missing "${listKey}" array`);
      }
      const cachePath = writeRegistryCache(name, data);
      const diff = diffRegistry(before, data, listKey);
      results.push({ name, url, cachePath, ok: true, ...diff });
      if (!json) {
        successMsg(`${name}: cached (${data[listKey].length} entries) → ${cachePath}`);
        if (diff.added.length) console.log(`  ${theme.label('+ added:')} ${diff.added.join(', ')}`);
        if (diff.removed.length) console.log(`  ${theme.label('- removed:')} ${diff.removed.join(', ')}`);
      }
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
      if (!json) errorMsg(`${name}: ${err.message}`);
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
