// A stand-in for the official MCP Registry, run as its own process so tests
// that spawn the CLI synchronously can still be answered. Serves fixture
// records on the by-name endpoint and prints `PORT=<n>` once listening.

import http from 'node:http';

const META = 'io.modelcontextprotocol.registry/official';
const active = { [META]: { status: 'active', isLatest: true } };

const FIXTURES = {
  'io.github.example/foo': {
    server: {
      name: 'io.github.example/foo', title: 'Foo', description: 'A fixture', version: '1.0.0',
      remotes: [{ type: 'streamable-http', url: 'https://foo.example/mcp' }],
    },
    _meta: active,
  },
  'io.github.example/needs-key': {
    server: {
      name: 'io.github.example/needs-key', version: '2.0.0',
      packages: [{
        registryType: 'npm', identifier: '@example/needs-key', transport: { type: 'stdio' },
        environmentVariables: [{ name: 'EXAMPLE_KEY', isRequired: true, description: 'the key' }],
      }],
    },
    _meta: active,
  },
};

const server = http.createServer((req, res) => {
  const m = req.url.match(/^\/v0\/servers\/([^/]+)\/versions\/latest$/);
  const record = m && FIXTURES[decodeURIComponent(m[1])];
  res.setHeader('content-type', 'application/json');
  if (!record) { res.statusCode = 404; res.end('{}'); return; }
  res.end(JSON.stringify(record));
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT=${server.address().port}\n`);
});
