import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
const node = process.execPath;

// Spawn the CLI as a real subprocess. Offline commands only — no network.
function runCli(args, opts = {}) {
  return spawnSync(node, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
    cwd: opts.cwd || process.cwd(),
  });
}

let tmpHome;
beforeEach(() => { tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-e2e-')); });
afterEach(() => { if (tmpHome) fs.removeSync(tmpHome); });

// Isolate HOME/cwd so the CLI reads empty manifests + bundled registry, not the dev's real config.
const isolated = () => ({ env: { HOME: tmpHome, USERPROFILE: tmpHome }, cwd: tmpHome });

test('e2e: --version prints a semver', () => {
  const r = runCli(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('e2e: --help exits 0 with usage', () => {
  const r = runCli(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:|Examples:/);
});

test('e2e: list --json emits parseable JSON', () => {
  const r = runCli(['list', '--json'], isolated());
  assert.equal(r.status, 0);
  assert.doesNotThrow(() => JSON.parse(r.stdout));
});

test('e2e: doctor --json emits parseable JSON with a summary', () => {
  const r = runCli(['doctor', '--json'], isolated());
  // doctor exits 1 only on errors; either way it prints JSON to stdout first.
  const parsed = JSON.parse(r.stdout);
  assert.ok('summary' in parsed);
  assert.ok(Array.isArray(parsed.findings));
});

test('e2e: cleanup --yes --dry-run --json emits a structured report, touches nothing', () => {
  const r = runCli(['cleanup', '--yes', '--dry-run', '--json'], isolated());
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.scope, 'both');
  assert.ok('system' in parsed && 'project' in parsed);
  // Isolated HOME/cwd hold nothing dxai-managed — nothing may be listed for removal.
  assert.deepEqual(parsed.project.files, []);
});

test('e2e: cleanup rejects an unknown scope', () => {
  const r = runCli(['cleanup', 'everything', '--json'], isolated());
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Unknown cleanup scope/);
});

// ── Regressions from the 1.0.1 sandbox run ──

test('e2e: an unknown subcommand is named, not reported as an argument to the hidden default command', () => {
  const r = runCli(['bogus'], isolated());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown command 'bogus'/);
  assert.doesNotMatch(r.stderr, /too many arguments/);
});

test('e2e: an expected failure prints one message, not a stack trace', () => {
  const r = runCli(['apply', 'no-such-profile', '--dry-run'], isolated());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^Error: Profile not found: no-such-profile/);
  assert.doesNotMatch(r.stderr, /^\s+at /m);
  const dbg = runCli(['apply', 'no-such-profile', '--dry-run'], { ...isolated(), env: { ...isolated().env, DXAI_DEBUG: '1' } });
  assert.match(dbg.stderr, /^\s+at /m); // opt-in stack for bug reports
});

test('e2e: a prompt without a terminal fails fast with a --yes hint instead of hanging', () => {
  // spawnSync pipes stdin, so this used to block on the scope prompt forever.
  const r = runCli(['cleanup', '--dry-run'], isolated());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /interactive terminal/);
  assert.match(r.stderr, /--yes/);
});

test('e2e: save-profile rejects unknown ids up front', () => {
  const r = runCli(['save-profile', 'bad', '--agents', 'nope', '--mcp', 'nada'], isolated());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown agent ID\(s\): nope\. Known:/);
  assert.ok(!fs.existsSync(path.join(tmpHome, '.dxai', 'profiles', 'bad.json')));
  const ok = runCli(['save-profile', 'good', '--agents', 'windsurf', '--mcp', 'github', '--json'], isolated());
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout).profile.agents, ['devin-desktop']); // former id normalised
});

test('e2e: cleanup never deletes a user\'s own home-level skill that shares a catalogue id', () => {
  const mine = path.join(tmpHome, '.claude', 'skills', 'frontend-design', 'SKILL.md');
  fs.outputFileSync(mine, '# mine, not dxai\'s');
  const r = runCli(['cleanup', 'system', '--yes', '--json'], isolated());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).system.skills, []);
  assert.ok(fs.existsSync(mine));
});

test('e2e: project cleanup removes generated Cursor command skills and empty project MCP files', () => {
  const init = runCli(['init', '--yes', '--json', '--no-update', '--agents', 'cursor,claude-code', '--stack', 'node', '--mcp', 'github',
    '--features', 'cursor-commands,project-mcp'], isolated());
  assert.equal(init.status, 0, init.stderr);
  assert.ok(fs.existsSync(path.join(tmpHome, '.cursor', 'skills', 'pr', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(tmpHome, '.mcp.json')));

  const r = runCli(['cleanup', 'project', '--yes', '--json'], isolated());
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.ok(report.project.files.some((f) => f.endsWith(path.join('pr', 'SKILL.md'))));
  assert.ok(!fs.existsSync(path.join(tmpHome, '.cursor', 'skills', 'pr')));
  assert.ok(!fs.existsSync(path.join(tmpHome, '.mcp.json')), '.mcp.json should be deleted, not left as {}');
  assert.ok(!fs.existsSync(path.join(tmpHome, '.cursor', 'mcp.json')));
  const manifest = fs.readJsonSync(path.join(tmpHome, '.dxai', 'manifest.json'));
  assert.deepEqual(manifest.mcp, {});
});

test('e2e: project cleanup removes skills its manifest recorded inside the project, never paths outside it', () => {
  const inside = path.join(tmpHome, '.agents', 'skills', 'docx');
  const mirror = path.join(tmpHome, '.claude', 'skills', 'docx');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-outside-'));
  const outsideSkill = path.join(outside, 'docx');
  for (const d of [inside, mirror, outsideSkill]) fs.outputFileSync(path.join(d, 'SKILL.md'), '# docx');
  fs.outputJsonSync(path.join(tmpHome, 'skills-lock.json'), { version: 1, skills: { docx: {} } });
  fs.outputJsonSync(path.join(tmpHome, '.dxai', 'manifest.json'), {
    version: 1, agents: [], mcp: {}, tools: {}, files: [],
    skills: { docx: { addedAt: 'x', path: path.join(tmpHome, '.agents', 'skills'), dirs: [inside, mirror, outsideSkill] } },
  });
  try {
    const r = runCli(['cleanup', 'project', '--yes', '--json'], isolated());
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.project.skills.length, 2);
    assert.ok(!fs.existsSync(inside) && !fs.existsSync(mirror));
    assert.ok(fs.existsSync(path.join(outsideSkill, 'SKILL.md')), 'a manifest path outside the project must be ignored');
    assert.ok(!fs.existsSync(path.join(tmpHome, 'skills-lock.json')), 'orphaned skills-lock.json is removed');
    assert.ok(!fs.existsSync(path.join(tmpHome, '.agents')), 'emptied skill dirs are removed');
    // The entry survives only for the directory that was (rightly) left alone.
    assert.deepEqual(fs.readJsonSync(path.join(tmpHome, '.dxai', 'manifest.json')).skills.docx.dirs, [outsideSkill]);
  } finally {
    fs.removeSync(outside);
  }
});
