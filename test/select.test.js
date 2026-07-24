import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelection, buildCatalogChoices } from '../src/select.js';

const KNOWN = ['alpha', 'beta', 'gamma'];

test('resolveSelection: explicit flag values win and are validated', async () => {
  const picked = await resolveSelection({
    flag: ['alpha', 'gamma'],
    knownIds: KNOWN,
    label: 'thing ID',
    nonInteractive: true,
    defaults: () => { throw new Error('defaults must not run'); },
    prompt: () => { throw new Error('prompt must not run'); },
  });
  assert.deepEqual(picked, ['alpha', 'gamma']);
});

test('resolveSelection: unknown flag values throw with a Known: hint', async () => {
  await assert.rejects(
    resolveSelection({
      flag: ['alpha', 'nope'],
      knownIds: KNOWN,
      label: 'thing ID',
      nonInteractive: false,
      defaults: () => [],
      prompt: () => [],
    }),
    /Unknown thing ID\(s\): nope. Known: alpha, beta, gamma/
  );
});

test('resolveSelection: requireNonEmpty rejects an all-invalid flag list', async () => {
  await assert.rejects(
    resolveSelection({
      flag: [],
      knownIds: KNOWN,
      label: 'thing ID',
      requireNonEmpty: true,
      nonInteractive: true,
      defaults: () => ['alpha'],
      prompt: () => ['alpha'],
    }),
    /No valid thing IDs specified/
  );
});

test('resolveSelection: non-interactive falls back to lazy defaults', async () => {
  const picked = await resolveSelection({
    flag: undefined,
    knownIds: KNOWN,
    label: 'thing ID',
    nonInteractive: true,
    defaults: () => ['beta'],
    prompt: () => { throw new Error('prompt must not run'); },
  });
  assert.deepEqual(picked, ['beta']);
});

test('resolveSelection: interactive mode delegates to prompt', async () => {
  const picked = await resolveSelection({
    flag: undefined,
    knownIds: KNOWN,
    label: 'thing ID',
    nonInteractive: false,
    defaults: () => { throw new Error('defaults must not run'); },
    prompt: async () => ['gamma'],
  });
  assert.deepEqual(picked, ['gamma']);
});

// ── buildCatalogChoices ──
const CATS = [
  { id: 'one', label: 'One', description: 'first' },
  { id: 'two', label: 'Two' },
  { id: 'empty', label: 'Empty' },
];
const ITEMS = [
  { id: 'a', name: 'A', description: 'aa', category: 'one', recommended: true },
  { id: 'b', name: 'B', description: 'bb', category: 'two' },
];

test('buildCatalogChoices groups by category, skips empty ones, checks recommended', () => {
  const choices = buildCatalogChoices(CATS, ITEMS);
  // 2 separators (empty category dropped) + 2 items.
  const items = choices.filter((c) => c.value !== undefined);
  assert.equal(choices.length, 4);
  assert.equal(items.length, 2);
  assert.equal(items[0].value, 'a');
  assert.equal(items[0].checked, true);
  assert.equal(items[1].value, 'b');
  assert.equal(items[1].checked, false);
});

test('buildCatalogChoices decorate() can annotate and override checked', () => {
  const choices = buildCatalogChoices(CATS, ITEMS, {
    decorate: (item) => ({ note: ` [${item.id}]`, checked: true }),
  });
  const items = choices.filter((c) => c.value !== undefined);
  assert.ok(items[0].name.includes('[a]'));
  assert.equal(items[1].checked, true);
});
