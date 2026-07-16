import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
const node = process.execPath;

// Spawn the CLI in an isolated HOME/cwd so it reads empty manifests + the
// bundled registry, never the developer's real config. Offline commands only.
let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-mcp-')); });
afterEach(() => { if (tmp) fs.removeSync(tmp); });

function runCli(args) {
  return spawnSync(node, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: tmp, USERPROFILE: tmp },
    cwd: tmp,
  });
}

const cursorMcpPath = () => path.join(tmp, '.cursor', 'mcp.json');

test('e2e add: writes the server into the targeted agent config', () => {
  const r = runCli(['add', 'context7', '--agents', 'cursor', '--yes', '--json']);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.added, ['context7']);
  assert.ok(fs.existsSync(cursorMcpPath()));
  const cfg = fs.readJsonSync(cursorMcpPath());
  assert.ok(cfg.mcpServers.context7);
});

test('e2e add --dry-run: writes nothing', () => {
  const r = runCli(['add', 'context7', '--agents', 'cursor', '--dry-run', '--json']);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.dryRun, true);
  assert.ok(!fs.existsSync(cursorMcpPath()));
});

test('e2e add: unknown server id exits non-zero with a Known: hint', () => {
  const r = runCli(['add', 'definitely-not-real', '--agents', 'cursor', '--json']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown MCP server/);
  assert.match(r.stderr, /Known:/);
});

test('e2e add: unknown agent id exits non-zero', () => {
  const r = runCli(['add', 'context7', '--agents', 'not-an-agent', '--json']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown agent/);
});

test('e2e remove: deletes a previously added server', () => {
  runCli(['add', 'context7', '--agents', 'cursor', '--yes', '--json']);
  const r = runCli(['remove', 'context7', '--agents', 'cursor', '--json']);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.removed.length, 1);
  assert.deepEqual(out.removed[0].removed, ['context7']);
  const cfg = fs.readJsonSync(cursorMcpPath());
  assert.ok(!cfg.mcpServers || !cfg.mcpServers.context7);
});

test('e2e remove: absent server is a clean no-op', () => {
  const r = runCli(['remove', 'context7', '--agents', 'cursor', '--json']);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.removed.length, 0);
});

test('e2e init: alias runs project setup and emits mode "project"', () => {
  const r = runCli(['init', '--yes', '--json', '--no-update', '--agents', 'cursor', '--stack', 'node']);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.mode, 'project');
});
