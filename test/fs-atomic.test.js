import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { writeFileAtomic, writeJsonAtomic } from '../src/fs-atomic.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-atomic-'));
}

test('writeJsonAtomic creates parent dirs and round-trips JSON', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'a', 'b', 'mcp.json');
    writeJsonAtomic(file, { mcpServers: { x: 1 } });
    assert.deepEqual(fs.readJsonSync(file), { mcpServers: { x: 1 } });
  } finally {
    fs.removeSync(dir);
  }
});

test('writeFileAtomic applies 0600 mode and leaves no temp files', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'config.toml');
    writeFileAtomic(file, '[mcp_servers.x]\n', { mode: 0o600 });
    assert.equal(fs.readFileSync(file, 'utf8'), '[mcp_servers.x]\n');
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    }
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
    assert.equal(leftovers.length, 0);
  } finally {
    fs.removeSync(dir);
  }
});

test('writeFileAtomic overwrites an existing file in place', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'f.json');
    writeJsonAtomic(file, { v: 1 });
    writeJsonAtomic(file, { v: 2 });
    assert.deepEqual(fs.readJsonSync(file), { v: 2 });
  } finally {
    fs.removeSync(dir);
  }
});
