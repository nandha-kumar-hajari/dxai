#!/usr/bin/env node
// Minimal fake MCP stdio server for handshake tests.
// Modes via FAKE_MCP_MODE: 'good' (default), 'bad' (garbage + exit), 'silent' (never reply).
const mode = process.env.FAKE_MCP_MODE || 'good';

if (mode === 'silent') {
  // Stay alive without ever responding so the handshake times out.
  setInterval(() => {}, 1000);
} else {
  let buf = '';
  process.stdin.on('data', (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (mode === 'bad') {
        process.stdout.write('not json at all\n');
        process.exit(1);
      }
      if (msg.method === 'initialize') {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              serverInfo: { name: 'fake-mcp', version: '0.0.0' },
            },
          }) + '\n'
        );
      }
    }
  });
}
