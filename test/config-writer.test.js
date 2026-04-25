import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { writeMcpConfigs } from '../src/config-writer.js';
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
