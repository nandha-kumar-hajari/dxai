import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { writeMcpConfigs, pinPackageVersion, installSkills, downloadSkillMarkdown } from '../src/config-writer.js';
import { MCP_SERVERS } from '../src/registry/mcp-servers.js';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-cw-')); });
afterEach(() => { if (tmp) fs.removeSync(tmp); });

const fakeJsonAgent = (configPath) => ({
  id: 'cursor',
  name: 'Cursor',
  configFormat: 'json',
  mcpKey: 'mcpServers',
  globalMcpPath: () => configPath,
});

const fakeTomlAgent = (configPath) => ({
  id: 'codex',
  name: 'Codex',
  configFormat: 'toml',
  mcpKey: 'mcp_servers',
  globalMcpPath: () => configPath,
});

test('writeMcpConfigs: JSON merge adds and skips existing', () => {
  const p = path.join(tmp, 'mcp.json');
  fs.writeJsonSync(p, { mcpServers: { context7: { url: 'preexisting' } } });

  const r = writeMcpConfigs([fakeJsonAgent(p)], ['context7', 'sequential-thinking'], MCP_SERVERS);
  assert.equal(r.cursor.added, 1);
  assert.equal(r.cursor.skipped, 1);

  const written = fs.readJsonSync(p);
  // Existing entry preserved verbatim.
  assert.deepEqual(written.mcpServers.context7, { url: 'preexisting' });
  // New entry added.
  assert.ok(written.mcpServers['sequential-thinking']);
});

test('writeMcpConfigs: filesystem placeholder is substituted from inputs', () => {
  const p = path.join(tmp, 'mcp.json');
  const inputs = { filesystem: { allowedPath: '/tmp/allowed' } };
  const r = writeMcpConfigs([fakeJsonAgent(p)], ['filesystem'], MCP_SERVERS, inputs);
  assert.equal(r.cursor.added, 1);
  const written = fs.readJsonSync(p);
  const args = written.mcpServers.filesystem.args;
  assert.ok(args.includes('/tmp/allowed'));
  assert.ok(!args.includes('/path/to/allowed'));
});

test('writeMcpConfigs: ~ in input is expanded to HOME', () => {
  const p = path.join(tmp, 'mcp.json');
  const inputs = { filesystem: { allowedPath: '~/Docs' } };
  writeMcpConfigs([fakeJsonAgent(p)], ['filesystem'], MCP_SERVERS, inputs);
  const args = fs.readJsonSync(p).mcpServers.filesystem.args;
  const expanded = args[args.length - 1];
  assert.ok(expanded.startsWith(os.homedir()));
  assert.ok(expanded.endsWith('Docs'));
});

test('writeMcpConfigs: refuses to overwrite malformed JSON', () => {
  const p = path.join(tmp, 'bad.json');
  fs.writeFileSync(p, '{ broken');
  const r = writeMcpConfigs([fakeJsonAgent(p)], ['context7'], MCP_SERVERS);
  // The agent record captures the error rather than crashing the whole call.
  assert.ok(r.cursor.errors.length > 0);
  // File preserved verbatim.
  assert.equal(fs.readFileSync(p, 'utf8'), '{ broken');
});

test('writeMcpConfigs: TOML merge appends new section, skips existing', () => {
  const p = path.join(tmp, 'config.toml');
  // Pre-existing entry that already names context7.
  fs.writeFileSync(p, '[mcp_servers.context7]\nurl = "preexisting"\n');
  const r = writeMcpConfigs([fakeTomlAgent(p)], ['context7', 'sequential-thinking'], MCP_SERVERS);
  assert.equal(r.codex.skipped, 1);
  assert.equal(r.codex.added, 1);
  const content = fs.readFileSync(p, 'utf8');
  assert.match(content, /\[mcp_servers\.context7\]/);
  assert.match(content, /\[mcp_servers\.sequential-thinking\]/);
  // Pre-existing url preserved.
  assert.match(content, /url = "preexisting"/);
});

test('writeMcpConfigs: backup file written when target existed', () => {
  const p = path.join(tmp, 'mcp.json');
  fs.writeJsonSync(p, { mcpServers: {} });
  writeMcpConfigs([fakeJsonAgent(p)], ['context7'], MCP_SERVERS);
  const siblings = fs.readdirSync(tmp);
  const backups = siblings.filter((f) => f.startsWith('mcp.json.bak.'));
  assert.equal(backups.length, 1);
});

test('writeMcpConfigs: pins package version for a server carrying a version field', () => {
  const p = path.join(tmp, 'mcp.json');
  // `memory` carries a pinned version in the bundled registry.
  writeMcpConfigs([fakeJsonAgent(p)], ['memory'], MCP_SERVERS);
  const args = fs.readJsonSync(p).mcpServers.memory.args;
  assert.ok(
    args.some((a) => /@modelcontextprotocol\/server-memory@\d/.test(a)),
    'memory package should be version-pinned'
  );
});

// ── pinPackageVersion (unit) ──────────────────
test('pinPackageVersion: appends version to a scoped package', () => {
  const c = pinPackageVersion({ command: 'npx', args: ['-y', '@scope/pkg'] }, '1.2.3');
  assert.deepEqual(c.args, ['-y', '@scope/pkg@1.2.3']);
});

test('pinPackageVersion: appends version to a bare package', () => {
  const c = pinPackageVersion({ command: 'npx', args: ['-y', 'pkg'] }, '1.2.3');
  assert.deepEqual(c.args, ['-y', 'pkg@1.2.3']);
});

test('pinPackageVersion: leaves an already-pinned package untouched', () => {
  const c = pinPackageVersion({ command: 'npx', args: ['-y', '@scope/pkg@9.9.9'] }, '1.2.3');
  assert.deepEqual(c.args, ['-y', '@scope/pkg@9.9.9']);
});

test('pinPackageVersion: does not touch path args', () => {
  const c = pinPackageVersion({ command: 'npx', args: ['-y', '@scope/pkg', '/some/path'] }, '1.0.0');
  assert.deepEqual(c.args, ['-y', '@scope/pkg@1.0.0', '/some/path']);
});

test('pinPackageVersion: pins the package after npx in a `claude mcp add` command', () => {
  const c = pinPackageVersion(
    { command: 'claude', args: ['mcp', 'add', 'x', '--', 'npx', '-y', '@scope/pkg'] },
    '2.0.0'
  );
  assert.deepEqual(c.args, ['mcp', 'add', 'x', '--', 'npx', '-y', '@scope/pkg@2.0.0']);
});

test('pinPackageVersion: pins inside a TOML args block', () => {
  const c = pinPackageVersion(
    { toml: '[mcp_servers.x]\ncommand = "npx"\nargs = ["-y", "@scope/pkg"]' },
    '3.0.0'
  );
  assert.match(c.toml, /"@scope\/pkg@3\.0\.0"/);
});

test('pinPackageVersion: no-op for a url-only config', () => {
  const c = pinPackageVersion({ url: 'https://example.com/mcp' }, '1.0.0');
  assert.deepEqual(c, { url: 'https://example.com/mcp' });
});

test('pinPackageVersion: no-op when version is absent', () => {
  const cfg = { command: 'npx', args: ['-y', 'pkg'] };
  assert.equal(pinPackageVersion(cfg, undefined), cfg);
});

// ── installSkills target directory (Codex reads .agents/skills natively) ──
// An empty skill list does no network work but still resolves the target dir,
// so we can assert the directory selection in isolation.
const agent = (id) => ({ id, name: id });
// process.cwd() may resolve macOS /var → /private/var symlinks, so compare the
// trailing path segments rather than the absolute path.
const tail = (p) => p.split(path.sep).slice(-2).join(path.sep);
const dirFor = async (agents) => {
  const cwd = process.cwd();
  try {
    process.chdir(tmp);
    return (await installSkills([], [], agents)).directory;
  } finally {
    process.chdir(cwd);
  }
};

test('installSkills: Codex selected → .agents/skills (Codex native path)', async () => {
  assert.equal(tail(await dirFor([agent('codex')])), path.join('.agents', 'skills'));
});

test('installSkills: Cursor + Codex → .agents/skills so Codex still finds them', async () => {
  assert.equal(tail(await dirFor([agent('cursor'), agent('codex')])), path.join('.agents', 'skills'));
});

test('installSkills: Cursor only (no Codex) → .cursor/skills', async () => {
  assert.equal(tail(await dirFor([agent('cursor')])), path.join('.cursor', 'skills'));
});

test('installSkills: neither Cursor nor Codex → .agents/skills fallback', async () => {
  assert.equal(tail(await dirFor([agent('claude-code')])), path.join('.agents', 'skills'));
});

// ── downloadSkillMarkdown (the native-fetch SKILL.md fallback) ──
// fetchImpl is injected so the fetch path is covered without a network.
test('downloadSkillMarkdown: returns content and builds the raw URL for a subpath', async () => {
  let seenUrl;
  const fetchImpl = async (url) => { seenUrl = url; return '# My Skill\n\nBody text.'; };
  const content = await downloadSkillMarkdown({ repo: 'owner/repo', path: 'skills/pdf' }, { fetchImpl });
  assert.equal(content, '# My Skill\n\nBody text.');
  assert.equal(seenUrl, 'https://raw.githubusercontent.com/owner/repo/main/skills/pdf/SKILL.md');
});

test('downloadSkillMarkdown: root path "." omits the subpath segment', async () => {
  let seenUrl;
  const fetchImpl = async (url) => { seenUrl = url; return 'x'; };
  await downloadSkillMarkdown({ repo: 'owner/repo', path: '.' }, { fetchImpl });
  assert.equal(seenUrl, 'https://raw.githubusercontent.com/owner/repo/main/SKILL.md');
});

test('downloadSkillMarkdown: an empty/whitespace body is treated as not found', async () => {
  const fetchImpl = async () => '   \n  ';
  await assert.rejects(
    downloadSkillMarkdown({ repo: 'owner/repo', path: '.' }, { fetchImpl }),
    /not found at source/
  );
});

test('downloadSkillMarkdown: a 404 (fetch rejection) propagates as an error', async () => {
  const fetchImpl = async () => { const e = new Error('HTTP 404 for url'); e.status = 404; throw e; };
  await assert.rejects(
    downloadSkillMarkdown({ repo: 'owner/repo', path: '.' }, { fetchImpl }),
    /HTTP 404/
  );
});

// ── backup behavior ──
test('writeMcpConfigs: no backup minted when nothing changes', () => {
  const p = path.join(tmp, 'mcp.json');
  fs.writeJsonSync(p, { mcpServers: {} });
  writeMcpConfigs([fakeJsonAgent(p)], ['context7'], MCP_SERVERS);
  // Second run adds nothing — must not touch the file or create another backup.
  const before = fs.readFileSync(p, 'utf8');
  writeMcpConfigs([fakeJsonAgent(p)], ['context7'], MCP_SERVERS);
  assert.equal(fs.readFileSync(p, 'utf8'), before);
  const backups = fs.readdirSync(tmp).filter((f) => f.startsWith('mcp.json.bak.'));
  assert.equal(backups.length, 1);
});

test('backup pruning: at most 5 .bak snapshots survive per file', () => {
  const p = path.join(tmp, 'mcp.json');
  fs.writeJsonSync(p, { mcpServers: {} });
  // Seed 7 fake old backups with ascending timestamps.
  for (let i = 1; i <= 7; i++) {
    fs.writeFileSync(`${p}.bak.2020-01-0${i}T00-00-0${i}`, '{}');
  }
  // A real write mints one more backup, then prunes to the cap.
  writeMcpConfigs([fakeJsonAgent(p)], ['context7'], MCP_SERVERS);
  const backups = fs.readdirSync(tmp).filter((f) => f.startsWith('mcp.json.bak.')).sort();
  assert.equal(backups.length, 5);
  // The oldest seeds are gone; the newest survivors remain.
  assert.ok(!backups.includes('mcp.json.bak.2020-01-01T00-00-01'));
});
