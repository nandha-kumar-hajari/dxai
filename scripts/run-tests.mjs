// Portable test runner.
//
// `node --test 'test/**/*.test.js'` only works where the runner expands the glob
// itself (Node 21+); on Node 18/20 the quoted pattern matches nothing and the
// run errors. Shell-expanding the glob instead breaks on Windows cmd.exe (npm's
// default script shell there). To run identically on Node 18-22 across Linux,
// macOS, and Windows, enumerate the test files here and pass them to `node
// --test` as explicit file arguments — which every supported version accepts.

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDir = path.join(repoRoot, 'test');

const files = readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .sort()
  .map((f) => path.join('test', f));

if (files.length === 0) {
  console.error('No test files found under test/.');
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  cwd: repoRoot,
  // Tests must exercise the catalogue in the repo, not a developer's ~/.dxai cache.
  env: { ...process.env, DXAI_REGISTRY_SOURCE: 'bundled' },
});

if (res.error) {
  console.error(res.error);
  process.exit(1);
}
process.exit(res.status ?? 1);
