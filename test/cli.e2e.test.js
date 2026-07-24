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

// Spawn the CLI as a real subprocess. Offline commands only — no network.
function runCli(args, opts = {}) {
  return spawnSync(node, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
    cwd: opts.cwd || process.cwd(),
  });
}

let tmpHome;
beforeEach(() => { tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-e2e-')); });
afterEach(() => { if (tmpHome) fs.removeSync(tmpHome); });

// Isolate HOME/cwd so the CLI reads empty manifests + bundled registry, not the dev's real config.
const isolated = () => ({ env: { HOME: tmpHome, USERPROFILE: tmpHome }, cwd: tmpHome });

test('e2e: --version prints a semver', () => {
  const r = runCli(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('e2e: --help exits 0 with usage', () => {
  const r = runCli(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:|Examples:/);
});

test('e2e: list --json emits parseable JSON', () => {
  const r = runCli(['list', '--json'], isolated());
  assert.equal(r.status, 0);
  assert.doesNotThrow(() => JSON.parse(r.stdout));
});

test('e2e: doctor --json emits parseable JSON with a summary', () => {
  const r = runCli(['doctor', '--json'], isolated());
  // doctor exits 1 only on errors; either way it prints JSON to stdout first.
  const parsed = JSON.parse(r.stdout);
  assert.ok('summary' in parsed);
  assert.ok(Array.isArray(parsed.findings));
});

test('e2e: cleanup --yes --dry-run --json emits a structured report, touches nothing', () => {
  const r = runCli(['cleanup', '--yes', '--dry-run', '--json'], isolated());
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.scope, 'both');
  assert.ok('system' in parsed && 'project' in parsed);
  // Isolated HOME/cwd hold nothing dxai-managed — nothing may be listed for removal.
  assert.deepEqual(parsed.project.files, []);
});

test('e2e: cleanup rejects an unknown scope', () => {
  const r = runCli(['cleanup', 'everything', '--json'], isolated());
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Unknown cleanup scope/);
});
