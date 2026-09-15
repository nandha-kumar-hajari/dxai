import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertInteractive, NoTerminalError } from '../src/select.js';
import { normalizeOptions } from '../src/runtime.js';
import { resolveInputPath } from '../src/config-writer.js';
import { candidateOriginals } from '../src/rollback.js';
import path from 'path';

test('assertInteractive throws a NoTerminalError with a --yes hint when stdin is not a TTY', () => {
  assert.throws(() => assertInteractive({ isTTY: false }), (err) => err instanceof NoTerminalError && /--yes/.test(err.message));
  assert.doesNotThrow(() => assertInteractive({ isTTY: true }));
});

test('--json implies non-interactive', () => {
  assert.equal(normalizeOptions({ json: true }).nonInteractive, true);
  assert.equal(normalizeOptions({}).nonInteractive, false);
});

test('resolveInputPath anchors relative paths to the project and expands ~', () => {
  const home = '/home/u';
  const cwd = '/work/app';
  assert.equal(resolveInputPath('.', { home, cwd }), '/work/app');
  assert.equal(resolveInputPath('./data', { home, cwd }), path.join('/work/app', 'data'));
  assert.equal(resolveInputPath('~/x', { home, cwd }), path.join(home, 'x'));
  assert.equal(resolveInputPath('/abs', { home, cwd }), '/abs');
});

test('rollback candidates include the project-level MCP files', () => {
  const cwd = '/work/app';
  const originals = candidateOriginals('/home/u', cwd);
  assert.ok(originals.includes(path.join(cwd, '.mcp.json')));
  assert.ok(originals.includes(path.join(cwd, '.cursor', 'mcp.json')));
  assert.ok(originals.includes(path.join(cwd, '.vscode', 'mcp.json')));
});
