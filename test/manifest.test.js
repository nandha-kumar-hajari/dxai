import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  readManifest, writeManifest, MANIFEST_VERSION, recordProjectSkills, PROJECT_MANIFEST_PATH,
  unrecordMcp,
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

test('unrecordMcp removes ids and cleans up an emptied agent bucket', () => {
  const p = path.join(tmp, 'm.json');
  const m = readManifest(p);
  m.mcp = { cursor: { context7: { addedAt: 'x' }, github: { addedAt: 'x' } } };
  writeManifest(p, m);

  const removed = unrecordMcp(p, 'cursor', ['context7']);
  assert.equal(removed, 1);
  let reread = readManifest(p);
  assert.ok(!reread.mcp.cursor.context7);
  assert.ok(reread.mcp.cursor.github);

  // Removing the last id drops the whole agent bucket.
  unrecordMcp(p, 'cursor', ['github']);
  reread = readManifest(p);
  assert.ok(!reread.mcp.cursor);
});

test('unrecordMcp never creates a missing manifest file', () => {
  const p = path.join(tmp, 'absent.json');
  assert.equal(unrecordMcp(p, 'cursor', ['context7']), 0);
  assert.ok(!fs.existsSync(p));
});

test('readManifest: entries recorded under a former agent id are folded into the current id', () => {
  const p = path.join(tmp, 'manifest.json');
  fs.writeJsonSync(p, {
    version: 1, agents: ['windsurf', 'cursor'],
    mcp: { windsurf: { context7: { addedAt: 't', configPath: '/old' } }, 'devin-desktop': { github: { addedAt: 't' } } },
  });
  const m = readManifest(p);
  assert.deepEqual(m.agents, ['devin-desktop', 'cursor']);
  assert.deepEqual(Object.keys(m.mcp), ['devin-desktop']);
  assert.deepEqual(Object.keys(m.mcp['devin-desktop']).sort(), ['context7', 'github']);
});
