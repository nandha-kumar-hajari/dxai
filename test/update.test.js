import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryBaseFor, DEFAULT_REGISTRY_BASE } from '../src/registry/loader.js';

test('registryBaseFor: explicit url wins over everything', () => {
  assert.equal(
    registryBaseFor({ url: 'https://example.com/r', version: 'v2' }),
    'https://example.com/r'
  );
});

test('registryBaseFor: version ref swaps the branch segment', () => {
  const base = registryBaseFor({ version: 'v1.2.0' });
  if (DEFAULT_REGISTRY_BASE.includes('/main/')) {
    assert.match(base, /\/v1\.2\.0\//);
    assert.ok(!base.includes('/main/'));
  }
});

test('registryBaseFor: default when nothing is provided', () => {
  assert.equal(registryBaseFor({}), DEFAULT_REGISTRY_BASE);
  assert.equal(registryBaseFor(), DEFAULT_REGISTRY_BASE);
});
