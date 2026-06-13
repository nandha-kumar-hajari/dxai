import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  isDue, shouldSkip, ttlMs, readLastCheck, recordCheck, maybeRefreshCatalog,
} from '../src/auto-update.js';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-au-')); });
afterEach(() => { if (tmp) fs.removeSync(tmp); });

const DAY = 24 * 60 * 60 * 1000;

// ── isDue ─────────────────────────────────────
test('isDue: no record is due', () => {
  assert.equal(isDue(null, Date.now(), 7 * DAY), true);
});

test('isDue: a recent check is not due', () => {
  const now = 1_000_000_000_000;
  const rec = { checkedAt: new Date(now - DAY).toISOString() };
  assert.equal(isDue(rec, now, 7 * DAY), false);
});

test('isDue: a check older than the ttl is due', () => {
  const now = 1_000_000_000_000;
  const rec = { checkedAt: new Date(now - 10 * DAY).toISOString() };
  assert.equal(isDue(rec, now, 7 * DAY), true);
});

test('isDue: a malformed timestamp is treated as due', () => {
  assert.equal(isDue({ checkedAt: 'not-a-date' }, Date.now(), 7 * DAY), true);
});

// ── ttlMs ─────────────────────────────────────
test('ttlMs: defaults to 7 days, honors override', () => {
  assert.equal(ttlMs({}), 7 * DAY);
  assert.equal(ttlMs({ DXAI_UPDATE_TTL_DAYS: '2' }), 2 * DAY);
});

// ── shouldSkip ────────────────────────────────
test('shouldSkip: json / ci / opt-out / --no-update all skip', () => {
  assert.equal(shouldSkip({ json: true }, {}), true);
  assert.equal(shouldSkip({ ci: true }, {}), true);
  assert.equal(shouldSkip({}, { DXAI_NO_AUTO_UPDATE: '1' }), true);
  assert.equal(shouldSkip({ update: false }, {}), true);
});

test('shouldSkip: plain interactive run does not skip', () => {
  assert.equal(shouldSkip({ update: true }, {}), false);
});

// ── readLastCheck / recordCheck ───────────────
test('recordCheck + readLastCheck round-trip', () => {
  const file = path.join(tmp, 'cache', '.last-check.json');
  const now = 1_700_000_000_000;
  recordCheck(now, file);
  const rec = readLastCheck(file);
  assert.equal(rec.checkedAt, new Date(now).toISOString());
});

test('readLastCheck: missing file returns null', () => {
  assert.equal(readLastCheck(path.join(tmp, 'nope.json')), null);
});

test('readLastCheck: malformed JSON returns null', () => {
  const file = path.join(tmp, 'bad.json');
  fs.writeFileSync(file, '{ broken');
  assert.equal(readLastCheck(file), null);
});

// ── maybeRefreshCatalog (orchestrator, no network) ──
const fakeResults = [{ name: 'mcp-servers', ok: true, added: ['x'], removed: [] }];

test('maybeRefreshCatalog: first run baselines the timer, no network', async () => {
  const file = path.join(tmp, '.last-check.json');
  let called = 0;
  const res = await maybeRefreshCatalog(
    { update: true },
    { now: 1_700_000_000_000, env: {}, lastCheckPath: file, refresh: async () => { called++; return []; }, log: () => {} }
  );
  assert.deepEqual(res, { firstRun: true });
  assert.equal(called, 0, 'refresh must not run on first check');
  assert.ok(readLastCheck(file), 'baseline timestamp recorded');
});

test('maybeRefreshCatalog: due run refreshes once and records the check', async () => {
  const file = path.join(tmp, '.last-check.json');
  const now = 1_700_000_000_000;
  recordCheck(now - 10 * DAY, file);
  let called = 0;
  const res = await maybeRefreshCatalog(
    { update: true },
    { now, env: {}, lastCheckPath: file, refresh: async () => { called++; return fakeResults; }, log: () => {} }
  );
  assert.equal(called, 1);
  assert.equal(res.refreshed, true);
  assert.equal(res.added, 1);
  assert.equal(readLastCheck(file).checkedAt, new Date(now).toISOString());
});

test('maybeRefreshCatalog: not-due run does not refresh', async () => {
  const file = path.join(tmp, '.last-check.json');
  const now = 1_700_000_000_000;
  recordCheck(now - 1 * DAY, file);
  let called = 0;
  const res = await maybeRefreshCatalog(
    { update: true },
    { now, env: {}, lastCheckPath: file, refresh: async () => { called++; return fakeResults; }, log: () => {} }
  );
  assert.deepEqual(res, { due: false });
  assert.equal(called, 0);
});

test('maybeRefreshCatalog: json runtime is skipped, no network', async () => {
  const file = path.join(tmp, '.last-check.json');
  let called = 0;
  const res = await maybeRefreshCatalog(
    { json: true },
    { now: Date.now(), env: {}, lastCheckPath: file, refresh: async () => { called++; return []; }, log: () => {} }
  );
  assert.deepEqual(res, { skipped: true });
  assert.equal(called, 0);
});

test('maybeRefreshCatalog: all-failed results (offline) report not-refreshed, no throw', async () => {
  const file = path.join(tmp, '.last-check.json');
  const now = 1_700_000_000_000;
  recordCheck(now - 10 * DAY, file);
  const allFailed = [{ name: 'mcp-servers', ok: false, error: 'HTTP 404' }];
  let logged = '';
  const res = await maybeRefreshCatalog(
    { update: true },
    { now, env: {}, lastCheckPath: file, refresh: async () => allFailed, log: (m) => { logged = m; } }
  );
  assert.equal(res.refreshed, false);
  assert.match(logged, /Couldn|offline/i);
});

test('maybeRefreshCatalog: a failing refresh does not throw and still records the check', async () => {
  const file = path.join(tmp, '.last-check.json');
  const now = 1_700_000_000_000;
  recordCheck(now - 10 * DAY, file);
  const res = await maybeRefreshCatalog(
    { update: true },
    { now, env: {}, lastCheckPath: file, refresh: async () => { throw new Error('offline'); }, log: () => {} }
  );
  assert.equal(res.refreshed, false);
  assert.equal(res.error, 'offline');
  assert.equal(readLastCheck(file).checkedAt, new Date(now).toISOString());
});
