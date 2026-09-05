// Registry loader — overlays remote/cached registry on top of bundled JSON.
//
// Resolution order at module init (synchronous):
//   1. Cache at ~/.dxai/cache/<name>.json  (written by `dxai update`)
//   2. Bundled snapshot at src/registry/data/<name>.json
//
// `dxai update` does the actual remote fetch and writes the cache. Reading is
// always synchronous so we don't impose top-level await on consumers.

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import { isSafeVersionRef } from './validate.js';
import { writeJsonAtomic } from '../fs-atomic.js';
import { fetchJson } from '../net.js';

// Default timeout for a registry fetch, so `dxai update` can't hang forever on a
// stalled connection.
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

const HOME = os.homedir();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CACHE_DIR = path.join(HOME, '.dxai', 'cache');
const BUNDLED_DIR = path.join(__dirname, 'data');

// Default remote URL — points at the bundled JSON in the repo. Overridable
// via the DXAI_REGISTRY_URL env var; that's the supported escape hatch for
// teams who want to host a fork.
export const DEFAULT_REGISTRY_BASE =
  process.env.DXAI_REGISTRY_URL ||
  'https://raw.githubusercontent.com/nandha-kumar-hajari/dxai/main/src/registry/data';

// Resolve the registry base URL for a fetch. Precedence:
//   explicit url  >  version ref (swaps the branch segment of the default)  >  default.
// When DXAI_REGISTRY_URL is set but carries no `/main/` segment, a version ref is a no-op.
export function registryBaseFor({ version, url } = {}) {
  if (url) return url;
  if (version) {
    // `version` is substituted into the fetch URL path; a "../.." here could
    // repoint the fetch at a different repo. Only allow a clean branch/tag ref.
    if (!isSafeVersionRef(version)) {
      throw new Error(`Invalid registry version ref: ${version}`);
    }
    return DEFAULT_REGISTRY_BASE.replace(/\/main\//, `/${version}/`);
  }
  return DEFAULT_REGISTRY_BASE;
}

function readJsonOr(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return fs.readJsonSync(filePath);
  } catch {
    return fallback;
  }
}

// Synchronously load a registry file: cache > bundled. Returns parsed JSON.
export function loadRegistry(name) {
  const cachePath = path.join(CACHE_DIR, `${name}.json`);
  const bundledPath = path.join(BUNDLED_DIR, `${name}.json`);

  const bundled = readJsonOr(bundledPath, null);
  if (!bundled) {
    throw new Error(`Bundled registry missing: ${bundledPath}`);
  }

  const cached = readJsonOr(cachePath, null);
  return cached ?? bundled;
}

// Remote fetch — used by `dxai update`. Async, since we hit the network.
// timeoutMs (optional) aborts a slow fetch; used by the background auto-refresh
// so a stale network never blocks an interactive run for long.
export async function fetchRegistry(name, baseUrl = DEFAULT_REGISTRY_BASE, { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, retries } = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}/${name}.json`;
  const data = await fetchJson(url, { timeoutMs, retries });
  return { url, data };
}

export function writeRegistryCache(name, data) {
  const cachePath = path.join(CACHE_DIR, `${name}.json`);
  writeJsonAtomic(cachePath, data, { spaces: 2 });
  return cachePath;
}

// Diff two registry payloads; returns added/removed entries by ID.
// Works on { servers: [...] } / { skills: [...] } / generic { items: [...] }.
export function diffRegistry(prev, next, key) {
  const prevIds = new Set((prev?.[key] || []).map((x) => x.id));
  const nextIds = new Set((next?.[key] || []).map((x) => x.id));
  const added = [...nextIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));
  return { added, removed };
}
