import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  scanJsonMcpConfig, removeJsonMcpServers,
  scanTomlMcpConfig, removeTomlMcpServers,
  scanBackupFiles, scanProjectFiles,
} from '../src/config-remover.js';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-rm-')); });
afterEach(() => { if (tmp) fs.removeSync(tmp); });

test('scanJsonMcpConfig finds known IDs', () => {
  const p = path.join(tmp, 'mcp.json');
  fs.writeJsonSync(p, { mcpServers: { github: {}, custom: {} } });
  const found = scanJsonMcpConfig(p, 'mcpServers', ['github', 'context7']);
  assert.deepEqual(found, ['github']);
});

test('removeJsonMcpServers cleans empty mcpKey object', () => {
  const p = path.join(tmp, 'mcp.json');
  fs.writeJsonSync(p, { mcpServers: { github: {} } });
  removeJsonMcpServers(p, 'mcpServers', ['github']);
  const after = fs.readJsonSync(p);
  assert.equal('mcpServers' in after, false);
});

test('scanTomlMcpConfig matches section headers', () => {
  const p = path.join(tmp, 'config.toml');
  fs.writeFileSync(p, '[mcp_servers.github]\ncommand = "x"\n\n[mcp_servers.custom]\n');
  const found = scanTomlMcpConfig(p, ['github', 'context7']);
  assert.deepEqual(found, ['github']);
});

test('removeTomlMcpServers strips section block', () => {
  const p = path.join(tmp, 'config.toml');
  fs.writeFileSync(p, '[mcp_servers.github]\ncommand = "x"\n\n[mcp_servers.custom]\nfoo = "bar"\n');
  removeTomlMcpServers(p, ['github']);
  const content = fs.readFileSync(p, 'utf8');
  assert.doesNotMatch(content, /\[mcp_servers\.github\]/);
  assert.match(content, /\[mcp_servers\.custom\]/);
});

test('scanBackupFiles is specific to the configured filename', () => {
  fs.writeFileSync(path.join(tmp, 'mcp.json.bak.2025-01-01'), '{}');
  fs.writeFileSync(path.join(tmp, 'unrelated.bak.txt'), 'x');
  fs.writeFileSync(path.join(tmp, 'other.json.bak.2025-01-01'), '{}');
  const found = scanBackupFiles([path.join(tmp, 'mcp.json')]);
  assert.equal(found.length, 1);
  assert.ok(found[0].endsWith('mcp.json.bak.2025-01-01'));
});

test('scanProjectFiles surfaces dxai-managed files only', () => {
  fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# x');
  fs.writeFileSync(path.join(tmp, 'README.md'), '# nope'); // should NOT be returned
  fs.ensureDirSync(path.join(tmp, '.cursor', 'rules'));
  fs.writeFileSync(path.join(tmp, '.cursor', 'rules', 'react.mdc'), 'x');
  const found = scanProjectFiles(tmp);
  const names = found.map((f) => f.relativePath).sort();
  assert.ok(names.includes('AGENTS.md'));
  assert.ok(names.some((n) => n.endsWith('react.mdc')));
  assert.ok(!names.includes('README.md'));
});
