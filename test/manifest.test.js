import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  readManifest, writeManifest, MANIFEST_VERSION, recordProjectSkills, PROJECT_MANIFEST_PATH,
} from '../src/manifest.js';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-manifest-')); });
afterEach(() => { if (tmp) fs.removeSync(tmp); });

test('readManifest returns empty shape when file missing', () => {
  const m = readManifest(path.join(tmp, 'nope.json'));
  assert.equal(m.version, MANIFEST_VERSION);
  assert.deepEqual(m.agents, []);
  assert.deepEqual(m.mcp, {});
  assert.deepEqual(m.skills, {});
  assert.deepEqual(m.files, []);
});

test('writeManifest stamps createdAt + updatedAt', () => {
  const p = path.join(tmp, 'm.json');
  const m = readManifest(p);
  m.agents = ['cursor'];
  const written = writeManifest(p, m);
  assert.ok(written.createdAt);
  assert.ok(written.updatedAt);
  assert.deepEqual(written.agents, ['cursor']);
  // Round-trip.
  const reread = readManifest(p);
  assert.deepEqual(reread.agents, ['cursor']);
});

test('writeManifest preserves createdAt across rewrites', async () => {
  const p = path.join(tmp, 'm.json');
  const first = writeManifest(p, readManifest(p));
  await new Promise((r) => setTimeout(r, 10));
  const second = writeManifest(p, readManifest(p));
  assert.equal(first.createdAt, second.createdAt);
  assert.notEqual(first.updatedAt, second.updatedAt);
});

test('readManifest tolerates malformed JSON (returns empty shape)', () => {
  const p = path.join(tmp, 'bad.json');
  fs.writeFileSync(p, '{ broken');
  const m = readManifest(p);
  assert.equal(m.version, MANIFEST_VERSION);
});

test('recordProjectSkills writes installed skills to the project manifest', () => {
  recordProjectSkills({ installed: ['PDF', 'Frontend Design'], directory: path.join(tmp, '.agents', 'skills') }, tmp);
  const m = readManifest(path.join(tmp, PROJECT_MANIFEST_PATH));
  assert.ok(m.skills['PDF']);
  assert.ok(m.skills['Frontend Design']);
  assert.ok(m.skills['PDF'].addedAt);
  assert.match(m.skills['PDF'].path, /\.agents[\\/]skills$/);
});

test('recordProjectSkills is a no-op when nothing was installed', () => {
  recordProjectSkills({ installed: [], directory: path.join(tmp, '.agents', 'skills') }, tmp);
  assert.ok(!fs.existsSync(path.join(tmp, PROJECT_MANIFEST_PATH)));
});
