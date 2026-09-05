import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryBaseFor, DEFAULT_REGISTRY_BASE } from '../src/registry/loader.js';
import { refreshRegistry } from '../src/update.js';

test('registryBaseFor: explicit url wins over everything', () => {
  assert.equal(
    registryBaseFor({ url: 'https://example.com/r', version: 'v2' }),
    'https://example.com/r'
  );
});

test('registryBaseFor: version ref swaps the branch segment', () => {
  const base = registryBaseFor({ version: 'v1.2.0' });
  if (DEFAULT_REGISTRY_BASE.includes('/main/')) {
    assert.match(base, /\/v1\.2\.0\//);
    assert.ok(!base.includes('/main/'));
  }
});

test('registryBaseFor: default when nothing is provided', () => {
  assert.equal(registryBaseFor({}), DEFAULT_REGISTRY_BASE);
  assert.equal(registryBaseFor(), DEFAULT_REGISTRY_BASE);
});

test('registryBaseFor: rejects a traversal version ref', () => {
  assert.throws(() => registryBaseFor({ version: '../../other-repo' }), /Invalid registry version/);
  assert.throws(() => registryBaseFor({ version: 'a/b' }), /Invalid registry version/);
});

// ── refreshRegistry: live re-resolution stage (no network, no real cache) ──

const SNAPSHOT = {
  'mcp-servers': {
    categories: [{ id: 'c', label: 'C' }],
    servers: [
      { id: 'linked', name: 'Linked', description: 'd', category: 'c', registry: { name: 'io.github.a/linked' }, transport: { type: 'http', url: 'https://snapshot.example/mcp' } },
      { id: 'plain', name: 'Plain', description: 'd', category: 'c', transport: { type: 'http', url: 'https://plain.example/mcp' } },
    ],
  },
  skills: { categories: [], skills: [] },
  'automation-tools': { categories: [], tools: [] },
};

function harness({ resolveFn } = {}) {
  const written = {};
  const deps = {
    fetch: async (name) => ({ url: `https://reg.example/${name}.json`, data: SNAPSHOT[name] }),
    loadPrev: () => null,
    writeCache: (name, data) => { written[name] = data; return `/tmp/${name}.json`; },
    resolveFn,
  };
  return { deps, written };
}

const liveEntries = (servers) => servers.map((s) => (s.registry
  ? { ...s, transport: { type: 'http', url: 'https://live.example/mcp' }, registry: { ...s.registry, resolved: { version: '2.0.0', at: 'now', fields: ['transport'] } } }
  : s));

test('refreshRegistry: live stage re-resolves linked servers and caches the result', async () => {
  let calls = 0;
  const { deps, written } = harness({
    resolveFn: async (servers) => { calls++; return { entries: liveEntries(servers), results: [{ id: 'linked', ok: true, changed: true }] }; },
  });
  const results = await refreshRegistry({ base: 'https://reg.example', ...deps });
  const mcp = results.find((r) => r.name === 'mcp-servers');
  assert.equal(calls, 1);
  assert.equal(mcp.ok, true);
  assert.deepEqual(mcp.live, { resolved: 1, failed: [], changed: ['linked'] });
  assert.equal(written['mcp-servers'].servers[0].transport.url, 'https://live.example/mcp');
  assert.equal(written['mcp-servers'].servers[1].transport.url, 'https://plain.example/mcp');
});

test('refreshRegistry: resolve:false skips the live stage', async () => {
  let calls = 0;
  const { deps, written } = harness({ resolveFn: async () => { calls++; throw new Error('should not run'); } });
  const results = await refreshRegistry({ base: 'https://reg.example', resolve: false, ...deps });
  assert.equal(calls, 0);
  assert.equal(results.find((r) => r.name === 'mcp-servers').live, undefined);
  assert.equal(written['mcp-servers'].servers[0].transport.url, 'https://snapshot.example/mcp');
});

test('refreshRegistry: a failed live lookup keeps the snapshot and is reported', async () => {
  const { deps, written } = harness({
    resolveFn: async (servers) => ({ entries: servers, results: [{ id: 'linked', ok: false, error: 'ECONNRESET' }] }),
  });
  const results = await refreshRegistry({ base: 'https://reg.example', ...deps });
  const mcp = results.find((r) => r.name === 'mcp-servers');
  assert.equal(mcp.ok, true, 'the file itself is still cached');
  assert.deepEqual(mcp.live.failed, [{ id: 'linked', error: 'ECONNRESET' }]);
  assert.equal(written['mcp-servers'].servers[0].transport.url, 'https://snapshot.example/mcp');
});

test('refreshRegistry: a resolver crash never sinks the file', async () => {
  const { deps, written } = harness({ resolveFn: async () => { throw new Error('boom'); } });
  const results = await refreshRegistry({ base: 'https://reg.example', ...deps });
  const mcp = results.find((r) => r.name === 'mcp-servers');
  assert.equal(mcp.ok, true);
  assert.match(mcp.live.error, /boom/);
  assert.equal(written['mcp-servers'].servers[0].transport.url, 'https://snapshot.example/mcp');
});

test('refreshRegistry: live output that fails validation is discarded', async () => {
  const { deps, written } = harness({
    resolveFn: async (servers) => ({
      entries: servers.map((s) => (s.registry ? { ...s, transport: { type: 'stdio', command: 'rm', args: ['-rf'] } } : s)),
      results: [{ id: 'linked', ok: true, changed: true }],
    }),
  });
  const results = await refreshRegistry({ base: 'https://reg.example', ...deps });
  const mcp = results.find((r) => r.name === 'mcp-servers');
  assert.match(mcp.live.error, /rejected/);
  assert.equal(written['mcp-servers'].servers[0].transport.url, 'https://snapshot.example/mcp');
});
