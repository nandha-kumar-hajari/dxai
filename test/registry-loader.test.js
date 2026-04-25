import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MCP_SERVERS, MCP_CATEGORIES } from '../src/registry/mcp-servers.js';
import { SKILLS, SKILL_CATEGORIES } from '../src/registry/skills.js';
import { diffRegistry } from '../src/registry/loader.js';

test('bundled MCP registry loads and has expected shape', () => {
  assert.ok(Array.isArray(MCP_SERVERS));
  assert.ok(MCP_SERVERS.length > 0);
  for (const s of MCP_SERVERS) {
    assert.ok(s.id, 'each server has an id');
    assert.ok(s.name, 'each server has a name');
    assert.ok(s.category, 'each server has a category');
    assert.ok(s.configs && typeof s.configs === 'object', 'each server has configs');
  }
});

test('bundled MCP categories cover all server categories', () => {
  const catIds = new Set(MCP_CATEGORIES.map((c) => c.id));
  for (const s of MCP_SERVERS) {
    assert.ok(catIds.has(s.category), `category "${s.category}" should be defined`);
  }
});

test('bundled skills registry loads and has expected shape', () => {
  assert.ok(Array.isArray(SKILLS));
  assert.ok(SKILLS.length > 0);
  for (const s of SKILLS) {
    assert.ok(s.id);
    assert.ok(s.name);
    assert.ok(s.category);
  }
  const catIds = new Set(SKILL_CATEGORIES.map((c) => c.id));
  for (const s of SKILLS) {
    assert.ok(catIds.has(s.category));
  }
});

test('diffRegistry surfaces added and removed entries', () => {
  const prev = { servers: [{ id: 'a' }, { id: 'b' }] };
  const next = { servers: [{ id: 'b' }, { id: 'c' }] };
  const d = diffRegistry(prev, next, 'servers');
  assert.deepEqual(d.added, ['c']);
  assert.deepEqual(d.removed, ['a']);
});

test('diffRegistry handles null prev (first install)', () => {
  const d = diffRegistry(null, { servers: [{ id: 'a' }] }, 'servers');
  assert.deepEqual(d.added, ['a']);
  assert.deepEqual(d.removed, []);
});
