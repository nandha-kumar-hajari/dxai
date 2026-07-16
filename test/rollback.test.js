import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

import {
  backupTimestamp, latestBackupFor, collectRestorable, restoreBackup,
} from '../src/rollback.js';

// Isolated temp dir per test run.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-rollback-'));

function seed(name, content) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

test('backupTimestamp: extracts the ts suffix, empty for non-backups', () => {
  assert.equal(backupTimestamp('/a/b/config.json.bak.2026-07-16T10-30-00'), '2026-07-16T10-30-00');
  assert.equal(backupTimestamp('/a/b/config.json'), '');
});

test('latestBackupFor: picks the newest of several backups', () => {
  const orig = seed('config.json', '{"current":true}');
  seed('config.json.bak.2026-07-16T09-00-00', '{"v":1}');
  seed('config.json.bak.2026-07-16T11-00-00', '{"v":3}');
  seed('config.json.bak.2026-07-16T10-00-00', '{"v":2}');

  const latest = latestBackupFor(orig);
  assert.ok(latest);
  assert.equal(latest.ts, '2026-07-16T11-00-00');
  assert.ok(latest.backup.endsWith('2026-07-16T11-00-00'));
});

test('latestBackupFor: null when no backups exist', () => {
  const orig = seed('lonely.json', '{}');
  assert.equal(latestBackupFor(orig), null);
});

test('collectRestorable: only returns paths that have a backup, de-duplicated', () => {
  const withBak = seed('a.json', 'a');
  seed('a.json.bak.2026-07-16T08-00-00', 'a-old');
  const without = seed('b.json', 'b');

  const restorable = collectRestorable([withBak, without, withBak]);
  assert.equal(restorable.length, 1);
  assert.equal(restorable[0].original, withBak);
});

test('restoreBackup: copies backup over original and snapshots the current file', () => {
  const orig = seed('restore-me.json', 'CURRENT');
  const bak = seed('restore-me.json.bak.2026-07-16T07-00-00', 'OLD');

  const res = restoreBackup(orig, bak);
  assert.equal(fs.readFileSync(orig, 'utf-8'), 'OLD'); // restored
  assert.ok(res.savedCurrentTo);
  assert.equal(fs.readFileSync(res.savedCurrentTo, 'utf-8'), 'CURRENT'); // reversible
});

test('restoreBackup: dry run writes nothing', () => {
  const orig = seed('keep.json', 'CURRENT');
  const bak = seed('keep.json.bak.2026-07-16T06-00-00', 'OLD');

  const res = restoreBackup(orig, bak, { dryRun: true });
  assert.equal(fs.readFileSync(orig, 'utf-8'), 'CURRENT'); // untouched
  assert.equal(res.savedCurrentTo, null);
});
