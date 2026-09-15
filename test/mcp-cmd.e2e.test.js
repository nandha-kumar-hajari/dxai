import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'child_process';
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

// The fixture registry (test/fixtures/fake-registry.mjs) runs as its own
// process: the CLI is spawned synchronously, which would block an in-process
// server from ever answering it.
let registry;
let registryUrl;
before(async () => {
  registry = spawn(node, [path.join(__dirname, 'fixtures', 'fake-registry.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  registryUrl = await new Promise((resolve, reject) => {
    let buf = '';
    registry.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/PORT=(\d+)/);
      if (m) resolve(`http://127.0.0.1:${m[1]}`);
    });
    registry.on('exit', (code) => reject(new Error(`fixture registry exited early (${code})`)));
  });
});
after(() => { registry?.kill(); });

function runCli(args) {
  return spawnSync(node, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: tmp, USERPROFILE: tmp, DXAI_MCP_REGISTRY_URL: registryUrl },
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

// ── add by MCP Registry name ──

test('e2e add by registry name: resolves live, writes the config, records provenance', () => {
  const r = runCli(['add', 'io.github.example/foo', '--agents', 'cursor', '--yes', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.added, ['foo']);
  const cfg = fs.readJsonSync(cursorMcpPath());
  assert.deepEqual(cfg.mcpServers.foo, { url: 'https://foo.example/mcp' });

  const manifest = fs.readJsonSync(path.join(tmp, '.dxai', 'manifest.json'));
  assert.equal(manifest.mcp.cursor.foo.registry, 'io.github.example/foo');
  assert.deepEqual(manifest.mcp.cursor.foo.requiresEnv, []);
});

test('e2e add by registry name: required env vars are recorded and surfaced by doctor', () => {
  const add = runCli(['add', 'io.github.example/needs-key', '--agents', 'cursor', '--yes', '--json']);
  assert.equal(add.status, 0, add.stderr);
  const manifest = fs.readJsonSync(path.join(tmp, '.dxai', 'manifest.json'));
  assert.deepEqual(manifest.mcp.cursor['needs-key'].requiresEnv, ['EXAMPLE_KEY']);

  const doctor = runCli(['doctor', '--json']);
  const parsed = JSON.parse(doctor.stdout);
  assert.ok(parsed.findings.some((f) => f.severity === 'warn' && f.msg.includes('EXAMPLE_KEY')), JSON.stringify(parsed.findings));
});

test('e2e add by registry name: status sees the live-added server as in sync', () => {
  runCli(['add', 'io.github.example/foo', '--agents', 'cursor', '--yes', '--json']);
  const r = runCli(['status', '--json']);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.clean, true, JSON.stringify(out.drift));
});

test('e2e add by registry name: --dry-run previews without writing', () => {
  const r = runCli(['add', 'io.github.example/foo', '--agents', 'cursor', '--dry-run', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.previews.cursor.wouldAdd, ['foo']);
  assert.ok(!fs.existsSync(cursorMcpPath()));
});

test('e2e add by registry name: a catalogue-linked name maps to the catalogue id', () => {
  const r = runCli(['add', 'io.github.upstash/context7', '--agents', 'cursor', '--dry-run', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).previews.cursor.wouldAdd, ['context7']);
});

test('e2e add by registry name: unknown name exits non-zero', () => {
  const r = runCli(['add', 'io.github.example/nope', '--agents', 'cursor', '--json']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Not found in the MCP Registry/);
});

test('e2e remove by registry name: removes the slug it was added under', () => {
  runCli(['add', 'io.github.example/foo', '--agents', 'cursor', '--yes', '--json']);
  const r = runCli(['remove', 'io.github.example/foo', '--agents', 'cursor', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).removed[0].removed, ['foo']);
  const cfg = fs.readJsonSync(cursorMcpPath());
  assert.ok(!cfg.mcpServers || !cfg.mcpServers.foo);
});

// ── Regressions from the 1.0.1 sandbox run ──

test('e2e remove --project: Claude Code edits ./.mcp.json, never the global CLI config', () => {
  const add = runCli(['add', 'memory', '--project', '--agents', 'claude-code', '--yes', '--json']);
  assert.equal(add.status, 0, add.stderr);
  const projectFile = path.join(tmp, '.mcp.json');
  assert.ok(fs.readJsonSync(projectFile).mcpServers.memory);

  const r = runCli(['remove', 'memory', '--project', '--agents', 'claude-code', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(fs.realpathSync(path.dirname(out.removed[0].path)), fs.realpathSync(tmp));
  assert.ok(!fs.existsSync(projectFile), 'emptied project file is removed rather than left as {}');
  const manifest = fs.readJsonSync(path.join(tmp, '.dxai', 'manifest.json'));
  assert.equal(manifest.mcp['claude-code'], undefined);
});

test('e2e add --json: stdout stays pure JSON even when a backup is taken', () => {
  runCli(['add', 'context7', '--agents', 'cursor', '--yes', '--json']);
  const r = runCli(['add', 'github', '--agents', 'cursor', '--yes', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout); // used to be preceded by an "ℹ Backed up:" line
  assert.match(out.results.cursor.backup, /mcp\.json\.bak\./);
  const text = runCli(['add', 'playwright', '--agents', 'cursor', '--yes']);
  assert.match(text.stdout, /Backed up: mcp\.json → mcp\.json\.bak\./); // text mode still says so
});

test('e2e remove: Codex sections written by dxai are actually removed from config.toml', () => {
  const add = runCli(['add', 'github', 'playwright', '--agents', 'codex', '--yes', '--json']);
  assert.equal(add.status, 0, add.stderr);
  const toml = path.join(tmp, '.codex', 'config.toml');
  assert.match(fs.readFileSync(toml, 'utf8'), /\[mcp_servers\.playwright\]/);

  const r = runCli(['remove', 'playwright', '--agents', 'codex', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const after = fs.readFileSync(toml, 'utf8');
  assert.doesNotMatch(after, /\[mcp_servers\.playwright\]/);
  assert.match(after, /\[mcp_servers\.github\]/);
  assert.equal(fs.statSync(toml).mode & 0o777, 0o600); // secret-capable file keeps its mode
  const status = runCli(['status', '--json']);
  assert.equal(JSON.parse(status.stdout).clean, true);
});

test('e2e add: a stdio server with a required input uses the project directory by default', () => {
  const r = runCli(['add', 'filesystem', '--agents', 'cursor', '--yes', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const cfg = fs.readJsonSync(cursorMcpPath());
  assert.equal(fs.realpathSync(cfg.mcpServers.filesystem.args.at(-1)), fs.realpathSync(tmp)); // not the whole home directory
});
