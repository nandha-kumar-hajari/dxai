// Periodic, opt-out catalog auto-refresh.
//
// The catalog (MCP servers, skills, automation tools) is decoupled from CLI releases:
// `dxai update` fetches it from the remote and caches it under ~/.dxai/cache/. This module
// makes that refresh happen on its own, on a TTL, so catalog improvements reach users who
// never run `dxai update` manually.
//
// IMPORTANT: the registry modules load their data at import time, so a refresh during a run
// updates the on-disk cache for the *next* run — it does not hot-swap the in-memory catalog.
// We refresh the cache and (optionally) nudge; we never pretend it changed the current run.

import fs from 'fs-extra';
import path from 'path';
import { CACHE_DIR, registryBaseFor } from './registry/loader.js';
import { refreshRegistry } from './update.js';
import { infoMsg } from './branding.js';
import { writeJsonAtomic } from './fs-atomic.js';

export const LAST_CHECK_PATH = path.join(CACHE_DIR, '.last-check.json');
const DEFAULT_TTL_DAYS = 7;
const DEFAULT_TIMEOUT_MS = 4000;

export function ttlMs(env = process.env) {
  const days = Number(env.DXAI_UPDATE_TTL_DAYS) || DEFAULT_TTL_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

function timeoutMs(env = process.env) {
  return Number(env.DXAI_UPDATE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
}

// Due for a refresh when we have never recorded a check, or the last one is older than the TTL.
export function isDue(lastCheck, now, ttl) {
  if (!lastCheck || !lastCheck.checkedAt) return true;
  const last = Date.parse(lastCheck.checkedAt);
  if (Number.isNaN(last)) return true;
  return now - last > ttl;
}

// Suppress the check for machine output, CI, explicit opt-out, or --no-update.
export function shouldSkip(runtime = {}, env = process.env) {
  return !!(runtime.json || runtime.ci || env.DXAI_NO_AUTO_UPDATE || runtime.update === false);
}

export function readLastCheck(file = LAST_CHECK_PATH) {
  if (!fs.existsSync(file)) return null;
  try {
    return fs.readJsonSync(file);
  } catch {
    return null;
  }
}

export function recordCheck(now, file = LAST_CHECK_PATH) {
  // Best-effort: an unwritable cache dir must not propagate out of the
  // background refresh and abort the user's setup.
  try {
    writeJsonAtomic(file, { checkedAt: new Date(now).toISOString() }, { spaces: 2 });
  } catch { /* ignore — we'll just re-check next run */ }
}

// Orchestrator. Dependencies are injectable so the whole flow is testable without a network.
export async function maybeRefreshCatalog(runtime = {}, deps = {}) {
  const {
    now = Date.now(),
    env = process.env,
    refresh = refreshRegistry,
    lastCheckPath = LAST_CHECK_PATH,
    log = infoMsg,
  } = deps;

  if (shouldSkip(runtime, env)) return { skipped: true };

  const record = readLastCheck(lastCheckPath);
  if (!isDue(record, now, ttlMs(env))) return { due: false };

  // Record immediately so an offline failure doesn't retry every single run.
  recordCheck(now, lastCheckPath);

  // First ever check: just baseline the timer. The freshly-installed package already
  // bundles a recent snapshot, so there's no need to hit the network on the very first run.
  if (!record) return { firstRun: true };

  try {
    const results = await refresh({ base: registryBaseFor({}), timeoutMs: timeoutMs(env) });
    // refreshRegistry captures per-file failures rather than throwing; if every file
    // failed (offline / registry down) treat the whole refresh as a miss.
    if (results.length && results.every((r) => !r.ok)) {
      if (!runtime.json) log('Couldn’t refresh catalog (offline?) — using cached data.');
      return { refreshed: false, results };
    }
    const added = results.reduce((n, r) => n + (r.added?.length || 0), 0);
    const removed = results.reduce((n, r) => n + (r.removed?.length || 0), 0);
    if ((added || removed) && !runtime.json) {
      log(`Catalog refreshed — ${added} new / ${removed} removed (applies on your next run).`);
    }
    return { refreshed: true, results, added, removed };
  } catch (err) {
    if (!runtime.json) log('Couldn’t refresh catalog (offline?) — using cached data.');
    return { refreshed: false, error: err.message };
  }
}
