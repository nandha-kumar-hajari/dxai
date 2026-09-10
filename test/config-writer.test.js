import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  writeMcpConfigs, writeProjectMcpConfigs, pinPackageVersion, installSkills, downloadSkillMarkdown,
  resolveClaudeEnvArgs, commandAsSkill, writeCursorCommands,
} from '../src/config-writer.js';
import { MCP_SERVERS } from '../src/registry/mcp-servers.js';
import { AGENT_DEFINITIONS } from '../src/detect.js';

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

// ── installSkills target directories ──
// `.agents/skills` is the cross-tool location (Codex, Cursor, Devin, Antigravity
// read it natively); Claude Code only reads `.claude/skills`, so it gets a mirror.
// An empty skill list does no network work but still resolves the target dirs.
const agent = (id) => ({ id, name: id });
// process.cwd() may resolve macOS /var → /private/var symlinks, so compare the
// trailing path segments rather than the absolute path.
const tail = (p) => p.split(path.sep).slice(-2).join(path.sep);
const inTmp = async (fn) => {
  const cwd = process.cwd();
  try { process.chdir(tmp); return await fn(); } finally { process.chdir(cwd); }
};
const dirsFor = (agents) => inTmp(async () => {
  const r = await installSkills([], [], agents);
  return { primary: tail(r.directory), extra: r.extraDirectories.map(tail) };
});

test('installSkills: Cursor only → .agents/skills (Cursor reads it natively now)', async () => {
  assert.deepEqual(await dirsFor([agent('cursor')]), { primary: path.join('.agents', 'skills'), extra: [] });
});

test('installSkills: Claude Code selected → .agents/skills plus a .claude/skills mirror', async () => {
  assert.deepEqual(await dirsFor([agent('cursor'), agent('claude-code')]), {
    primary: path.join('.agents', 'skills'),
    extra: [path.join('.claude', 'skills')],
  });
});

test('installSkills: an already-installed skill is mirrored to .claude/skills for Claude Code', async () => {
  await inTmp(async () => {
    fs.outputFileSync(path.join('.agents', 'skills', 'pdf', 'SKILL.md'), '# pdf');
    await installSkills(['pdf'], [{ id: 'pdf', name: 'PDF', repo: 'o/r', path: '.' }], [agent('claude-code')]);
    assert.equal(fs.readFileSync(path.join('.claude', 'skills', 'pdf', 'SKILL.md'), 'utf-8'), '# pdf');
  });
});

// ── Claude Code env resolution ──
test('resolveClaudeEnvArgs: fills --env from the environment and drops unset pairs', () => {
  const args = ['mcp', 'add', '--scope', 'user', '--env', 'A=${A}', '--env', 'B=${B}', '--transport', 'stdio', 'x', '--', 'npx', 'pkg'];
  assert.deepEqual(resolveClaudeEnvArgs(args, { A: 'secret' }), [
    'mcp', 'add', '--scope', 'user', '--env', 'A=secret', '--transport', 'stdio', 'x', '--', 'npx', 'pkg',
  ]);
  // Literal --env values (not placeholders) pass through untouched.
  assert.deepEqual(resolveClaudeEnvArgs(['--env', 'K=v'], {}), ['--env', 'K=v']);
});

// ── Cursor commands are written as skills ──
test('commandAsSkill: wraps a command body in SKILL.md frontmatter that blocks auto-invocation', () => {
  const md = commandAsSkill('pr', '# Create Pull Request\n\n1. Do it');
  assert.match(md, /^---\nname: pr\ndescription: Create Pull Request\. Invoke with \/pr\.\ndisable-model-invocation: true\n---\n/);
  assert.match(md, /# Create Pull Request/);
});

test('writeCursorCommands: lands in .cursor/skills/<name>/SKILL.md and never overwrites', async () => {
  await inTmp(() => {
    const first = writeCursorCommands({ pr: '# PR', review: '# Review' });
    assert.deepEqual(first.sort(), [path.join('pr', 'SKILL.md'), path.join('review', 'SKILL.md')]);
    assert.ok(fs.existsSync(path.join('.cursor', 'skills', 'pr', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join('.cursor', 'commands')));
    assert.deepEqual(writeCursorCommands({ pr: '# changed' }), []);
    assert.match(fs.readFileSync(path.join('.cursor', 'skills', 'pr', 'SKILL.md'), 'utf-8'), /# PR/);
  });
});

// ── Project-level writers ──
test('writeProjectMcpConfigs: Claude Code gets .mcp.json with type/url, Codex gets .codex/config.toml', async () => {
  await inTmp(() => {
    const claude = AGENT_DEFINITIONS.find((a) => a.id === 'claude-code');
    const codex = AGENT_DEFINITIONS.find((a) => a.id === 'codex');
    const r = writeProjectMcpConfigs([claude, codex], ['context7'], MCP_SERVERS);
    assert.equal(r['claude-code'].added, 1);
    assert.equal(r.codex.added, 1);
    const mcpJson = fs.readJsonSync('.mcp.json');
    assert.deepEqual(mcpJson.mcpServers.context7, { type: 'http', url: 'https://mcp.context7.com/mcp' });
    assert.match(fs.readFileSync(path.join('.codex', 'config.toml'), 'utf-8'), /\[mcp_servers\.context7\]/);
  });
});

test('writeMcpConfigs: agents with no interpolation get env values substituted at write time', () => {
  const p = path.join(tmp, 'mcp_config.json');
  const literalAgent = { ...fakeJsonAgent(p), id: 'antigravity', mcpDialect: { kind: 'json', urlKey: 'serverUrl', envRef: 'literal' } };
  process.env.DXAI_TEST_GITLAB = 'tok-123';
  try {
    const gitlab = MCP_SERVERS.find((s) => s.id === 'gitlab');
    const server = { ...gitlab, requiresEnv: { DXAI_TEST_GITLAB: 'x', DXAI_TEST_UNSET: 'y' }, configs: {
      antigravity: { command: 'npx', args: ['-y', 'pkg'], env: { DXAI_TEST_GITLAB: '${DXAI_TEST_GITLAB}', DXAI_TEST_UNSET: '${DXAI_TEST_UNSET}' } },
    } };
    writeMcpConfigs([literalAgent], ['gitlab'], [server]);
    const env = fs.readJsonSync(p).mcpServers.gitlab.env;
    assert.equal(env.DXAI_TEST_GITLAB, 'tok-123');
    assert.equal(env.DXAI_TEST_UNSET, '${DXAI_TEST_UNSET}');
  } finally {
    delete process.env.DXAI_TEST_GITLAB;
  }
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
