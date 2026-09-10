import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectAgents, AGENT_DEFINITIONS, INSTALL_COMMANDS, AGENT_ID_ALIASES, normalizeAgentIds, findAgent } from '../src/detect.js';

let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-detect-')); });
afterEach(() => { if (home) fs.removeSync(home); });

// Point app detection at an empty dir so a developer's real /Applications
// never leaks into these assertions.
const detect = (opts = {}) => detectAgents(home, { applicationsDir: path.join(home, 'Applications'), ...opts });
const find = (agents, id) => agents.find((a) => a.id === id);

test('detectAgents: Antigravity CLI installed at ~/.local/bin is detected without being on PATH', () => {
  const bin = path.join(home, '.local', 'bin', 'agy');
  fs.outputFileSync(bin, '#!/bin/sh\necho "agy version 1.2.0"\n', { mode: 0o755 });

  const cli = find(detect(), 'antigravity-cli');
  assert.equal(cli.installed, true);
  if (process.platform !== 'win32') assert.equal(cli.version, '1.2.0');
});

test('detectAgents: Antigravity IDE in-app shim under ~/.antigravity-ide is detected', () => {
  fs.outputFileSync(path.join(home, '.antigravity-ide', 'antigravity-ide', 'bin', 'agy-ide'), '', { mode: 0o755 });

  const ide = find(detect(), 'antigravity-ide');
  assert.equal(ide.installed, true);
});

test('detectAgents: Antigravity desktop app is detected from its bundle and versioned from Info.plist', { skip: process.platform !== 'darwin' && 'macOS app bundles only' }, () => {
  const bundle = path.join(home, 'Applications', 'Antigravity.app', 'Contents');
  fs.outputFileSync(path.join(bundle, 'Info.plist'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0"><dict>',
    '  <key>CFBundleShortVersionString</key>',
    '  <string>2.11.0</string>',
    '</dict></plist>',
  ].join('\n'));

  const app = find(detect(), 'antigravity');
  assert.equal(app.installed, true);
  assert.equal(app.version, '2.11.0');
});

test('detectAgents: each Antigravity surface reports its own state dir as configExists', () => {
  fs.ensureDirSync(path.join(home, '.gemini', 'antigravity'));

  const agents = detect();
  assert.equal(find(agents, 'antigravity').configExists, true);
  assert.equal(find(agents, 'antigravity-ide').configExists, false);
  assert.equal(find(agents, 'antigravity-cli').configExists, false);
});

test('detectAgents: nothing installed in an empty home', () => {
  const agents = detect();
  // Agents with a real shell command may be present on the developer machine;
  // the ones detectable only by app bundle or install path must be absent.
  for (const id of ['antigravity', 'antigravity-ide', 'antigravity-cli']) {
    const a = find(agents, id);
    if (id === 'antigravity' || !AGENT_DEFINITIONS.find((d) => d.id === id).detectCommand) {
      assert.equal(a.installed, false, `${id} should not be detected`);
    }
    assert.equal(a.configExists, false);
    assert.equal(a.version === null || typeof a.version === 'string', true);
  }
});

test('detectAgents: Devin Desktop is still found under its former Windsurf names', { skip: process.platform !== 'darwin' && 'macOS app bundles only' }, () => {
  fs.ensureDirSync(path.join(home, 'Applications', 'Windsurf.app', 'Contents'));
  const devin = find(detect(), 'devin-desktop');
  assert.equal(devin.installed, true);
  assert.deepEqual(devin.legacyGlobalMcpPaths(home), [path.join(home, '.codeium', 'windsurf', 'mcp_config.json')]);
});

test('former agent ids resolve to the current definition', () => {
  assert.deepEqual(AGENT_ID_ALIASES, { windsurf: 'devin-desktop' });
  assert.deepEqual(normalizeAgentIds(['windsurf', 'cursor', 'devin-desktop']), ['devin-desktop', 'cursor']);
  assert.equal(findAgent('windsurf').id, 'devin-desktop');
  assert.equal(findAgent('nope'), null);
});

test('every agent definition carries the fields the health check and docs rely on', () => {
  for (const def of AGENT_DEFINITIONS) {
    assert.match(def.verifiedAt || '', /^\d{4}-\d{2}-\d{2}$/, `${def.id}: verifiedAt`);
    assert.ok(Array.isArray(def.docs) && def.docs.length > 0 && def.docs.every((u) => /^https:\/\//.test(u)), `${def.id}: docs`);
    assert.equal(typeof def.install, 'object', `${def.id}: install`);
    assert.ok(def.mcpDialect, `${def.id}: mcpDialect`);
    if (def.mcpDialect.kind === 'json') assert.ok(['dollar', 'vscode', 'literal'].includes(def.mcpDialect.envRef), `${def.id}: envRef`);
    if (def.projectMcpDialect) assert.ok(def.projectMcpPath, `${def.id}: projectMcpDialect without projectMcpPath`);
    assert.ok(def.detectCommand || def.detectApp || def.detectPaths, `${def.id}: no detection signal`);
  }
});

test('every agent has an install command for each OS and shares one MCP dialect per family', () => {
  for (const def of AGENT_DEFINITIONS) {
    const cmds = INSTALL_COMMANDS[def.id];
    assert.ok(cmds, `INSTALL_COMMANDS missing for ${def.id}`);
    for (const osName of ['macOS', 'Linux', 'Windows']) assert.equal(typeof cmds[osName], 'string', `${def.id} lacks ${osName} install command`);
  }
  const family = AGENT_DEFINITIONS.filter((d) => d.id.startsWith('antigravity'));
  assert.equal(family.length, 3);
  const mcpPaths = new Set(family.map((d) => d.globalMcpPath('/h')));
  assert.equal(mcpPaths.size, 1, 'the Antigravity family shares one MCP config file');
  const stateDirs = new Set(family.map((d) => d.configDir('/h')));
  assert.equal(stateDirs.size, 3, 'each Antigravity surface has its own state dir');
});
