import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { handshakeServer, resolveSpawnSpec } from '../src/handshake.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'fake-mcp-server.mjs');
const node = process.execPath;

test('handshakeServer: ok when server responds to initialize', async () => {
  const res = await handshakeServer({ command: node, args: [FIXTURE] });
  assert.equal(res.ok, true);
});

test('handshakeServer: fails when server emits garbage and exits', async () => {
  const res = await handshakeServer(
    { command: node, args: [FIXTURE], env: { FAKE_MCP_MODE: 'bad' } },
    { timeoutMs: 2000 }
  );
  assert.equal(res.ok, false);
  assert.ok(res.error);
});

test('handshakeServer: times out when server never responds', async () => {
  const res = await handshakeServer(
    { command: node, args: [FIXTURE], env: { FAKE_MCP_MODE: 'silent' } },
    { timeoutMs: 400 }
  );
  assert.equal(res.ok, false);
  assert.match(res.error, /no response/);
});

test('handshakeServer: fails when the command does not exist', async () => {
  const res = await handshakeServer(
    { command: 'definitely-not-a-real-binary-xyz', args: [] },
    { timeoutMs: 2000 }
  );
  assert.equal(res.ok, false);
});

test('resolveSpawnSpec: returns null for remote/url servers', () => {
  assert.equal(resolveSpawnSpec({ configs: { cursor: { url: 'https://example.com/mcp' } } }), null);
});

test('resolveSpawnSpec: extracts command/args from a stdio config', () => {
  const spec = resolveSpawnSpec({ configs: { cursor: { command: 'npx', args: ['-y', 'pkg'] } } });
  assert.equal(spec.command, 'npx');
  assert.deepEqual(spec.args, ['-y', 'pkg']);
});

test('resolveSpawnSpec: expands ${VAR} env references from the environment', () => {
  process.env.DXAI_TEST_TOKEN = 'secret123';
  try {
    const spec = resolveSpawnSpec({
      configs: { cursor: { command: 'npx', args: ['-y', 'pkg'], env: { TOK: '${DXAI_TEST_TOKEN}' } } },
    });
    assert.equal(spec.env.TOK, 'secret123');
  } finally {
    delete process.env.DXAI_TEST_TOKEN;
  }
});
