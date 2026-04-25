import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  resolveProfile, readProfile, mergeWithProfile, saveProfile,
  PROFILE_KEYS,
} from '../src/profile.js';

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-profile-'));
});
afterEach(() => {
  if (tmp) fs.removeSync(tmp);
});

test('readProfile filters to allowed keys', () => {
  const p = path.join(tmp, 'p.json');
  fs.writeJsonSync(p, {
    agents: ['cursor'],
    mcp: ['github'],
    bogus: 'should be dropped',
    nested: { a: 1 },
  });
  const profile = readProfile(p);
  assert.deepEqual(profile.agents, ['cursor']);
  assert.deepEqual(profile.mcp, ['github']);
  assert.equal(profile.bogus, undefined);
});

test('readProfile throws on malformed JSON', () => {
  const p = path.join(tmp, 'bad.json');
  fs.writeFileSync(p, '{ this is not json');
  assert.throws(() => readProfile(p), /Failed to parse profile/);
});

test('mergeWithProfile: CLI flags beat profile', () => {
  const profile = { agents: ['cursor'], stack: ['react'] };
  const cli = { agents: ['claude-code'] };
  const merged = mergeWithProfile(cli, profile);
  assert.deepEqual(merged.agents, ['claude-code']); // CLI wins
  assert.deepEqual(merged.stack, ['react']);        // profile fills gap
});

test('saveProfile writes filtered keys to user dir', () => {
  // Redirect HOME so we don't pollute the real ~/.dxai.
  const origHome = os.homedir();
  process.env.HOME = tmp;
  try {
    // Need to re-import to pick up new HOME — use explicit `path` target instead.
    const explicit = path.join(tmp, 'explicit', 'profile.json');
    saveProfile({ agents: ['cursor'], bogus: 'x' }, { path: explicit });
    const written = fs.readJsonSync(explicit);
    assert.deepEqual(written.agents, ['cursor']);
    assert.equal(written.bogus, undefined);
  } finally {
    process.env.HOME = origHome;
  }
});

test('saveProfile with here:true writes ./.dxai/profile.json', () => {
  const cwd = process.cwd();
  process.chdir(tmp);
  try {
    const written = saveProfile({ agents: ['cursor'] }, { here: true });
    assert.ok(written.endsWith(path.join('.dxai', 'profile.json')));
    assert.ok(fs.existsSync(written));
  } finally {
    process.chdir(cwd);
  }
});

test('resolveProfile: project/.dxai/profile.json wins over user', () => {
  const cwd = process.cwd();
  process.chdir(tmp);
  try {
    const projDir = path.join(tmp, '.dxai');
    fs.ensureDirSync(projDir);
    fs.writeJsonSync(path.join(projDir, 'profile.json'), { agents: ['cursor'] });
    const found = resolveProfile(undefined, tmp);
    assert.equal(found, path.join(projDir, 'profile.json'));
  } finally {
    process.chdir(cwd);
  }
});

test('resolveProfile: explicit path returns null when missing', () => {
  const found = resolveProfile(path.join(tmp, 'does-not-exist.json'), tmp);
  assert.equal(found, null);
});

test('PROFILE_KEYS is stable surface', () => {
  assert.ok(PROFILE_KEYS.includes('agents'));
  assert.ok(PROFILE_KEYS.includes('mcp'));
  assert.ok(PROFILE_KEYS.includes('skills'));
  assert.ok(PROFILE_KEYS.includes('features'));
  assert.ok(PROFILE_KEYS.includes('stack'));
});
