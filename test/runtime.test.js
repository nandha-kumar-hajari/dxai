import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptions, partitionByKnown } from '../src/runtime.js';

test('normalizeOptions defaults are interactive', () => {
  delete process.env.CI;
  delete process.env.DXAI_DRY_RUN;
  const r = normalizeOptions({});
  assert.equal(r.yes, false);
  assert.equal(r.ci, false);
  assert.equal(r.dryRun, false);
  assert.equal(r.json, false);
  assert.equal(r.nonInteractive, false);
});

test('--yes implies non-interactive', () => {
  const r = normalizeOptions({ yes: true });
  assert.equal(r.yes, true);
  assert.equal(r.nonInteractive, true);
});

test('CI=true forces non-interactive + json', () => {
  process.env.CI = 'true';
  try {
    const r = normalizeOptions({});
    assert.equal(r.ci, true);
    assert.equal(r.nonInteractive, true);
    assert.equal(r.json, true);
  } finally {
    delete process.env.CI;
  }
});

test('DXAI_DRY_RUN=1 is honored', () => {
  process.env.DXAI_DRY_RUN = '1';
  try {
    const r = normalizeOptions({});
    assert.equal(r.dryRun, true);
  } finally {
    delete process.env.DXAI_DRY_RUN;
  }
});

test('partitionByKnown splits valid/invalid', () => {
  const { valid, invalid } = partitionByKnown(['a', 'b', 'z'], ['a', 'b', 'c']);
  assert.deepEqual(valid, ['a', 'b']);
  assert.deepEqual(invalid, ['z']);
});

test('partitionByKnown returns empty arrays for null input', () => {
  const { valid, invalid } = partitionByKnown(null, ['a']);
  assert.deepEqual(valid, []);
  assert.deepEqual(invalid, []);
});
