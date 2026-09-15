import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { backupTimestampNow, nextBackupPath, backupFile, BACKUP_SUFFIX_RE } from '../src/backup.js';
import { backupTimestamp, latestBackupFor, restoreBackup } from '../src/rollback.js';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-bak-')); });
afterEach(() => { if (tmp) fs.removeSync(tmp); });

test('backup timestamps carry milliseconds and still sort chronologically', () => {
  const a = backupTimestampNow(new Date('2026-09-14T15:42:51.123Z'));
  const b = backupTimestampNow(new Date('2026-09-14T15:42:51.124Z'));
  assert.equal(a, '2026-09-14T15-42-51-123');
  assert.ok(a < b);
  assert.match(`x.bak.${a}`, BACKUP_SUFFIX_RE);
  assert.equal(backupTimestamp(`/p/x.bak.${a}`), a);
});

test('two backups of one file in the same millisecond never share a name', () => {
  const p = path.join(tmp, 'mcp.json');
  fs.writeFileSync(p, 'v1');
  const when = new Date('2026-09-14T15:42:51.000Z');
  const first = nextBackupPath(p, when);
  fs.copySync(p, first);
  fs.writeFileSync(p, 'v2');
  const second = nextBackupPath(p, when);
  assert.notEqual(first, second);
  assert.ok(second.startsWith(first));
  fs.copySync(p, second);
  assert.equal(fs.readFileSync(first, 'utf8'), 'v1'); // the earlier snapshot survived
});

test('rollback then rollback again restores the state before the first rollback', () => {
  // The old 1-second names made the second rollback snapshot the current file
  // over the backup it was about to restore, turning it into a silent no-op.
  const p = path.join(tmp, 'config.toml');
  fs.writeFileSync(p, 'BEFORE');
  const bak = backupFile(p);
  fs.writeFileSync(p, 'AFTER');

  const first = restoreBackup(p, bak);
  assert.equal(fs.readFileSync(p, 'utf8'), 'BEFORE');
  assert.notEqual(first.savedCurrentTo, bak);

  const latest = latestBackupFor(p);
  assert.equal(latest.backup, first.savedCurrentTo);
  restoreBackup(p, latest.backup);
  assert.equal(fs.readFileSync(p, 'utf8'), 'AFTER');
});

test('older names without milliseconds are still recognised and ordered below new ones', () => {
  const p = path.join(tmp, 'settings.json');
  fs.writeFileSync(p, 'now');
  fs.writeFileSync(`${p}.bak.2026-09-14T15-42-51`, 'old-format');
  fs.writeFileSync(`${p}.bak.2026-09-14T15-42-51-500`, 'new-format');
  assert.equal(fs.readFileSync(latestBackupFor(p).backup, 'utf8'), 'new-format');
});
