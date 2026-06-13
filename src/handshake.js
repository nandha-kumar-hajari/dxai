// MCP stdio handshake — spawns a server and confirms it speaks JSON-RPC.
//
// Used by `dxai doctor --handshake`. This is the first use of child_process.spawn
// in the repo (everything else uses execSync); we need streaming stdio + a timeout,
// which execSync can't give us.

import { spawn } from 'child_process';

const PROTOCOL_VERSION = '2025-06-18';

function initRequest(clientVersion) {
  return (
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'dxai-doctor', version: clientVersion || '0.0.0' },
      },
    }) + '\n'
  );
}

// Spawn an MCP stdio server and confirm it answers `initialize` with a JSON-RPC result.
// spec: { command, args, env } — the stdio launch command.
// Resolves { ok, error? }; always kills the child before resolving.
export function handshakeServer(spec, { timeoutMs = 10000, clientVersion } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(spec.command, spec.args || [], {
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, ...(spec.env || {}) },
      });
    } catch (err) {
      resolve({ ok: false, error: `spawn failed: ${err.message}` });
      return;
    }

    let settled = false;
    let buf = '';

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: `no response within ${timeoutMs}ms` }),
      timeoutMs
    );

    child.on('error', (err) => finish({ ok: false, error: `spawn failed: ${err.message}` }));
    child.on('exit', (code) => finish({ ok: false, error: `exited (code ${code}) before responding` }));

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      // stdio transport is newline-delimited JSON-RPC.
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg && msg.id === 1) {
          if (msg.result) finish({ ok: true });
          else finish({ ok: false, error: msg.error?.message || 'initialize returned an error' });
          return;
        }
      }
    });

    try {
      child.stdin.write(initRequest(clientVersion));
    } catch (err) {
      finish({ ok: false, error: `stdin write failed: ${err.message}` });
    }
  });
}

// Expand ${VAR} / $VAR references in a config env block from the current environment.
function resolveEnv(env) {
  if (!env) return {};
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== 'string') continue;
    out[k] = v.replace(/\$\{?(\w+)\}?/g, (_m, name) => process.env[name] ?? '');
  }
  return out;
}

// Resolve a stdio spawn spec from a server's registry configs. Prefers a
// command/args (npx-style) config. Returns null for remote/URL-only servers,
// which can't be stdio-handshaked.
export function resolveSpawnSpec(server) {
  const configs = server.configs || {};
  for (const key of ['cursor', 'vscode', 'gemini', 'windsurf', 'antigravity']) {
    const c = configs[key];
    if (c && c.command && Array.isArray(c.args)) {
      return { command: c.command, args: c.args, env: resolveEnv(c.env) };
    }
  }
  return null;
}
