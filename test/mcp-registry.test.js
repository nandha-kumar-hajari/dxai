import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pickTransport, applyResolution, slugForRegistryName, fetchRegistryServer,
  fetchRegistrySearch, registryServerUrl, resolveEntries,
} from '../src/registry/mcp-registry.js';
import { isValidRegistryName, isHttpsUrl, validateRegistryBlock } from '../src/registry/validate.js';

const META = 'io.modelcontextprotocol.registry/official';
const record = (server, official = { status: 'active' }) => ({ server, _meta: { [META]: official } });

const npmPkg = (identifier, extra = {}) => ({ registryType: 'npm', identifier, version: '1.2.3', transport: { type: 'stdio' }, ...extra });
const remote = (url, type = 'streamable-http', headers = []) => ({ type, url, headers });

// ── pickTransport ──

test('pickTransport: remote wins over package by default', () => {
  const r = pickTransport(record({
    name: 'io.github.upstash/context7', version: '4.0.5',
    packages: [npmPkg('@upstash/context7-mcp')],
    remotes: [remote('https://mcp.context7.com/mcp')],
  }));
  assert.deepEqual(r.transport, { type: 'http', url: 'https://mcp.context7.com/mcp' });
  assert.equal(r.source, 'remote');
  assert.equal(r.version, '4.0.5');
  assert.deepEqual(r.requiresEnv, {});
});

test('pickTransport: prefer.transport=package picks the package', () => {
  const r = pickTransport(record({
    name: 'com.supabase/mcp', version: '0.12.0',
    packages: [npmPkg('@supabase/mcp-server-supabase', {
      environmentVariables: [{ name: 'SUPABASE_ACCESS_TOKEN', isRequired: true, isSecret: true, description: 'Personal access token' }],
    })],
    remotes: [remote('https://mcp.supabase.com/mcp')],
  }), { transport: 'package' });
  assert.deepEqual(r.transport, { type: 'stdio', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase'] });
  assert.equal(r.source, 'package');
  assert.equal(r.version, '1.2.3');
  assert.deepEqual(r.requiresEnv, { SUPABASE_ACCESS_TOKEN: 'Personal access token' });
});

test('pickTransport: streamable-http beats sse, prefer.remote selects among many', () => {
  const remotes = [
    remote('https://docs.mcp.cloudflare.com/sse', 'sse'),
    remote('https://docs.mcp.cloudflare.com/mcp'),
    remote('https://bindings.mcp.cloudflare.com/mcp'),
    remote('https://bindings.mcp.cloudflare.com/sse', 'sse'),
  ];
  const first = pickTransport(record({ name: 'com.cloudflare.mcp/mcp', remotes }));
  assert.equal(first.transport.url, 'https://docs.mcp.cloudflare.com/mcp');

  const picked = pickTransport(record({ name: 'com.cloudflare.mcp/mcp', remotes }), { remote: 'bindings.mcp.cloudflare.com' });
  assert.equal(picked.transport.url, 'https://bindings.mcp.cloudflare.com/mcp');

  const miss = pickTransport(record({ name: 'com.cloudflare.mcp/mcp', remotes }), { remote: 'nope.example' });
  assert.equal(miss.transport.url, 'https://docs.mcp.cloudflare.com/mcp');
  assert.ok(miss.warnings.some((w) => w.includes('prefer.remote')));
});

test('pickTransport: sse-only remote is used with a warning', () => {
  const r = pickTransport(record({ name: 'x/y', remotes: [remote('https://example.com/sse', 'sse')] }));
  assert.equal(r.transport.url, 'https://example.com/sse');
  assert.ok(r.warnings.some((w) => /SSE/.test(w)));
});

test('pickTransport: non-https remote is skipped', () => {
  const r = pickTransport(record({
    name: 'x/y',
    remotes: [remote('http://insecure.example/mcp')],
    packages: [npmPkg('safe-pkg')],
  }));
  assert.equal(r.source, 'package');
  assert.ok(r.warnings.some((w) => w.includes('not https')));
});

test('pickTransport: pypi maps to uvx; oci/mcpb are reported unsupported', () => {
  const r = pickTransport(record({
    name: 'x/y',
    packages: [
      { registryType: 'oci', identifier: 'ghcr.io/x/y:1', transport: { type: 'stdio' } },
      { registryType: 'mcpb', identifier: 'https://example.com/y.mcpb', transport: { type: 'stdio' } },
      { registryType: 'pypi', identifier: 'my-server', transport: { type: 'stdio' } },
    ],
  }));
  assert.deepEqual(r.transport, { type: 'stdio', command: 'uvx', args: ['my-server'] });
  assert.equal(r.warnings.filter((w) => w.includes('not supported')).length, 2);
});

test('pickTransport: package identifier with shell metacharacters is rejected', () => {
  const r = pickTransport(record({ name: 'x/y', packages: [npmPkg('evil; rm -rf /')] }));
  assert.equal(r.transport, null);
  assert.ok(r.warnings.some((w) => w.includes('rejected')));
  assert.ok(r.warnings.some((w) => w.includes('no usable transport')));
});

test('pickTransport: required positional argument becomes a placeholder input', () => {
  const r = pickTransport(record({
    name: 'x/filesystem',
    packages: [npmPkg('@x/server-filesystem', {
      packageArguments: [
        { type: 'positional', valueHint: 'allowed_path', description: 'Directory the server may access', isRequired: true, default: '~' },
        { type: 'named', name: '--verbose', value: 'true' },
        { type: 'named', name: '--optional-flag' },
      ],
    })],
  }));
  assert.deepEqual(r.transport.args, ['-y', '@x/server-filesystem', '{allowed_path}', '--verbose', 'true']);
  assert.deepEqual(r.requiresInput, {
    allowed_path: { prompt: 'Directory the server may access', default: '~', placeholder: '{allowed_path}' },
  });
});

test('pickTransport: only isRequired env vars are collected', () => {
  const r = pickTransport(record({
    name: 'x/y',
    packages: [npmPkg('pkg', {
      environmentVariables: [
        { name: 'API_KEY', isRequired: true, description: 'key' },
        { name: 'OPTIONAL', isRequired: false },
        { name: 'UNSPECIFIED' },
      ],
    })],
  }));
  assert.deepEqual(r.requiresEnv, { API_KEY: 'key' });
});

test('pickTransport: required remote header falls back to a package unless remote is forced', () => {
  const server = {
    name: 'x/y',
    packages: [npmPkg('pkg')],
    remotes: [remote('https://api.example/mcp', 'streamable-http', [{ name: 'Authorization', isRequired: true, isSecret: true }])],
  };
  const fallback = pickTransport(record(server));
  assert.equal(fallback.source, 'package');
  assert.ok(fallback.warnings.some((w) => w.includes('requires header')));

  const forced = pickTransport(record(server), { transport: 'remote' });
  assert.equal(forced.source, 'remote');
  assert.ok(forced.warnings.some((w) => w.includes('not rendered')));

  const noPkg = pickTransport(record({ ...server, packages: [] }));
  assert.equal(noPkg.source, 'remote');
});

test('pickTransport: deprecated status marks the entry stale', () => {
  const r = pickTransport(record(
    { name: 'x/y', remotes: [remote('https://example.com/mcp')] },
    { status: 'deprecated', statusMessage: 'Use x/z instead' },
  ));
  assert.equal(r.stale, true);
  assert.equal(r.staleReason, 'Use x/z instead');
});

test('pickTransport: accepts a bare server.json without the envelope', () => {
  const r = pickTransport({ name: 'x/y', version: '2.0.0', remotes: [remote('https://example.com/mcp')] });
  assert.equal(r.transport.url, 'https://example.com/mcp');
  assert.equal(r.status, 'active');
});

// ── applyResolution ──

const resolution = (over = {}) => ({
  registryVersion: '9.9.9',
  transport: { type: 'http', url: 'https://new.example/mcp' },
  requiresEnv: { TOKEN: 'a token' },
  requiresInput: {},
  version: '9.9.9',
  stale: false,
  staleReason: undefined,
  ...over,
});

test('applyResolution: first run claims every field the entry does not define', () => {
  const entry = { id: 'x', name: 'X', category: 'c', registry: { name: 'x/y' }, requiresEnv: { CURATED: 'kept' } };
  const { entry: next, changed } = applyResolution(entry, resolution());
  assert.equal(changed, true);
  assert.deepEqual(next.transport, { type: 'http', url: 'https://new.example/mcp' });
  assert.deepEqual(next.requiresEnv, { CURATED: 'kept' }, 'curated field is left alone');
  assert.equal(next.version, '9.9.9');
  assert.ok(!('stale' in next), 'empty values are not written');
  assert.deepEqual(next.registry.resolved.fields, ['transport', 'requiresInput', 'version', 'stale', 'staleReason']);
  assert.equal(next.registry.resolved.version, '9.9.9');
  assert.match(next.registry.resolved.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('applyResolution: later runs only touch the recorded fields', () => {
  const entry = {
    id: 'x', category: 'c',
    registry: { name: 'x/y', resolved: { version: '1.0.0', at: '2026-01-01T00:00:00.000Z', fields: ['transport'] } },
    transport: { type: 'http', url: 'https://old.example/mcp' },
    requiresEnv: { HAND: 'edited' },
    version: '1.0.0',
  };
  const { entry: next } = applyResolution(entry, resolution());
  assert.equal(next.transport.url, 'https://new.example/mcp');
  assert.deepEqual(next.requiresEnv, { HAND: 'edited' });
  assert.equal(next.version, '1.0.0', 'version was not in fields, so it stays');
  // Absent resolvable fields are claimed; present, unlisted ones stay curated.
  assert.deepEqual(next.registry.resolved.fields, ['transport', 'requiresInput', 'stale', 'staleReason']);
});

test('applyResolution: deleting a field hands it back to the resolver', () => {
  const entry = {
    id: 'x', category: 'c',
    registry: { name: 'x/y', resolved: { version: '1.0.0', at: '2026-01-01T00:00:00.000Z', fields: ['transport'] } },
    transport: { type: 'http', url: 'https://old.example/mcp' },
  };
  const { entry: next } = applyResolution(entry, resolution());
  assert.deepEqual(next.requiresEnv, { TOKEN: 'a token' });
  assert.ok(next.registry.resolved.fields.includes('requiresEnv'));
});

test('applyResolution: an identical resolution reports no change', () => {
  const entry = {
    id: 'x', category: 'c',
    registry: { name: 'x/y', resolved: { version: '9.9.9', at: '2026-01-01T00:00:00.000Z', fields: ['transport', 'requiresEnv', 'requiresInput', 'version', 'stale', 'staleReason'] } },
    transport: { type: 'http', url: 'https://new.example/mcp' },
    requiresEnv: { TOKEN: 'a token' },
    version: '9.9.9',
  };
  const { entry: next, changed } = applyResolution(entry, resolution(), { now: new Date('2026-02-02T00:00:00Z') });
  assert.equal(changed, false);
  assert.equal(next.registry.resolved.at, '2026-02-02T00:00:00.000Z');
});

test('applyResolution: deprecated resolution writes stale + reason, and clears them when it recovers', () => {
  const entry = { id: 'x', category: 'c', registry: { name: 'x/y' } };
  const { entry: stale } = applyResolution(entry, resolution({ stale: true, staleReason: 'gone' }));
  assert.equal(stale.stale, true);
  assert.equal(stale.staleReason, 'gone');
  const { entry: recovered } = applyResolution(stale, resolution());
  assert.ok(!('stale' in recovered) && !('staleReason' in recovered));
});

// ── helpers ──

test('slugForRegistryName: last segment, slugified', () => {
  assert.equal(slugForRegistryName('io.github.upstash/context7'), 'context7');
  assert.equal(slugForRegistryName('io.github.microsoft/playwright-mcp'), 'playwright-mcp');
  assert.equal(slugForRegistryName('com.example/My_Server.v2'), 'my-server-v2');
});

test('isValidRegistryName: reverse-DNS namespace, one slash', () => {
  assert.equal(isValidRegistryName('io.github.upstash/context7'), true);
  assert.equal(isValidRegistryName('com.figma.mcp/mcp'), true);
  assert.equal(isValidRegistryName('context7'), false);
  assert.equal(isValidRegistryName('a/b/c'), false);
  assert.equal(isValidRegistryName('a/b c'), false);
  assert.equal(isValidRegistryName('../x/y'), false);
});

test('isHttpsUrl: https only', () => {
  assert.equal(isHttpsUrl('https://mcp.example/mcp'), true);
  assert.equal(isHttpsUrl('http://mcp.example/mcp'), false);
  assert.equal(isHttpsUrl('not a url'), false);
});

test('validateRegistryBlock: shape checks', () => {
  assert.deepEqual(validateRegistryBlock('x', undefined), []);
  assert.deepEqual(validateRegistryBlock('x', { name: 'io.github.a/b' }), []);
  assert.deepEqual(validateRegistryBlock('x', { name: 'io.github.a/b', prefer: { transport: 'remote', remote: 'foo' }, resolved: { fields: ['transport'] } }), []);
  assert.ok(validateRegistryBlock('x', { name: 'nope' }).length);
  assert.ok(validateRegistryBlock('x', { name: 'a/b', prefer: { transport: 'sideways' } }).length);
  assert.ok(validateRegistryBlock('x', { name: 'a/b', resolved: { fields: ['configs'] } }).length);
});

test('fetchRegistrySearch: builds the query and unwraps the envelope', async () => {
  let seen;
  const fetchImpl = async (url) => { seen = url; return { servers: [record({ name: 'a/b' })], metadata: { count: 1 } }; };
  const hits = await fetchRegistrySearch('gitlab', { base: 'https://reg.example', fetchImpl, limit: 5 });
  assert.equal(seen, 'https://reg.example/v0/servers?search=gitlab&version=latest&limit=5');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].server.name, 'a/b');
});

test('registryServerUrl: encodes the name and tolerates a trailing slash', () => {
  assert.equal(
    registryServerUrl('io.github.upstash/context7', 'https://reg.example/'),
    'https://reg.example/v0/servers/io.github.upstash%2Fcontext7/versions/latest',
  );
});

test('fetchRegistryServer: 404 is null, other errors propagate, bad names throw', async () => {
  const notFound = async () => { const e = new Error('HTTP 404'); e.status = 404; throw e; };
  assert.equal(await fetchRegistryServer('a/b', { fetchImpl: notFound }), null);

  const boom = async () => { const e = new Error('HTTP 503'); e.status = 503; throw e; };
  await assert.rejects(fetchRegistryServer('a/b', { fetchImpl: boom }), /503/);

  await assert.rejects(fetchRegistryServer('nope', { fetchImpl: async () => ({}) }), /Invalid registry server name/);
});

// ── resolveEntries ──

test('resolveEntries: resolves registry entries, keeps explicit ones, isolates failures', async () => {
  const records = {
    'io.github.a/one': record({ name: 'io.github.a/one', version: '1.0.0', remotes: [remote('https://one.example/mcp')] }),
    'io.github.a/broken': record({ name: 'io.github.a/broken', version: '1.0.0', packages: [{ registryType: 'oci', identifier: 'x', transport: { type: 'stdio' } }] }),
  };
  const fetchImpl = async (url) => {
    const name = decodeURIComponent(url.split('/v0/servers/')[1].split('/versions/')[0]);
    if (name === 'io.github.a/missing') { const e = new Error('HTTP 404'); e.status = 404; throw e; }
    if (name === 'io.github.a/down') { throw new Error('ECONNRESET'); }
    return records[name];
  };
  const entries = [
    { id: 'one', category: 'c', registry: { name: 'io.github.a/one' } },
    { id: 'explicit', category: 'c', transport: { type: 'http', url: 'https://keep.example/mcp' } },
    { id: 'missing', category: 'c', registry: { name: 'io.github.a/missing' }, transport: { type: 'http', url: 'https://snapshot.example/mcp' } },
    { id: 'down', category: 'c', registry: { name: 'io.github.a/down' } },
    { id: 'broken', category: 'c', registry: { name: 'io.github.a/broken' } },
  ];
  const { entries: out, results } = await resolveEntries(entries, { fetchImpl, concurrency: 2 });

  assert.equal(out[0].transport.url, 'https://one.example/mcp');
  assert.deepEqual(out[1], entries[1], 'explicit entry untouched');
  assert.equal(out[2].transport.url, 'https://snapshot.example/mcp', 'failed lookup keeps the snapshot');
  assert.deepEqual(out[3], entries[3]);

  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId.one.ok, true);
  assert.equal(byId.one.changed, true);
  assert.equal(byId.missing.ok, false);
  assert.match(byId.missing.error, /not found/);
  assert.equal(byId.down.ok, false);
  assert.match(byId.down.error, /ECONNRESET/);
  assert.equal(byId.broken.ok, false);
  assert.match(byId.broken.error, /no usable transport/);
  assert.equal(results.length, 4, 'explicit entries produce no result row');
});
