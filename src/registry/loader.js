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

const HOME = os.homedir();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CACHE_DIR = path.join(HOME, '.dxai', 'cache');
export const BUNDLED_DIR = path.join(__dirname, 'data');

// Default remote URL — points at the bundled JSON in the repo. Overridable
// via the DXAI_REGISTRY_URL env var; that's the supported escape hatch for
// teams who want to host a fork.
export const DEFAULT_REGISTRY_BASE =
  process.env.DXAI_REGISTRY_URL ||
  'https://raw.githubusercontent.com/nandha-kumar-hajari/dxai/main/src/registry/data';

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
export async function fetchRegistry(name, baseUrl = DEFAULT_REGISTRY_BASE) {
  const url = `${baseUrl.replace(/\/$/, '')}/${name}.json`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const data = await res.json();
  return { url, data };
}

export function writeRegistryCache(name, data) {
  fs.ensureDirSync(CACHE_DIR);
  const cachePath = path.join(CACHE_DIR, `${name}.json`);
  fs.writeJsonSync(cachePath, data, { spaces: 2 });
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
