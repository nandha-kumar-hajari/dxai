// Re-run every generator into a copy of the committed docs and diff back.
//
// Strategy:
//   1. Copy docs/src/content/docs → tmp.
//   2. Set DXAI_DOCS_OUT=tmp and run every generator.
//   3. Diff tmp against the committed docs.
//
// Hand-written pages remain untouched in tmp (because they're not regenerated),
// so they diff identically. Only files that generators write differently
// from what's committed will surface.
import fs from 'node:fs';
import path from 'node:path';
import os from 'os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const committedDocs = path.join(repoRoot, 'docs', 'src', 'content', 'docs');

if (!fs.existsSync(committedDocs)) {
  console.error(`Expected ${committedDocs} to exist.`);
  process.exit(1);
}

const dir = __dirname;
const generators = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('gen-') && f.endsWith('.mjs'))
  .sort();

if (generators.length === 0) {
  console.log('docs:check — no generators yet (waiting on later phases).');
  process.exit(0);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-docs-check-'));
const tmpOut = path.join(tmpRoot, 'docs', 'src', 'content', 'docs');
fs.cpSync(committedDocs, tmpOut, { recursive: true });

process.env.DXAI_DOCS_OUT = tmpOut;

let failed = 0;
for (const f of generators) {
  const url = pathToFileURL(path.join(dir, f)).href;
  try {
    const mod = await import(url);
    if (typeof mod.default === 'function') await mod.default();
  } catch (err) {
    console.error(`Generator ${f} failed:`, err);
    failed++;
  }
}

if (failed > 0) {
  console.error(`${failed} generator(s) failed`);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  process.exit(1);
}

// changelog.md is generated from `git log`, so it is inherently non-deterministic
// across checkouts: a PR runs against a merge commit (extra commit + base history
// the branch doesn't have) and the "Unreleased" section can never contain its own
// tip commit's hash. Byte-diffing it would fail every PR regardless of correctness,
// so it is excluded from the drift gate — the deterministic reference pages
// (commands, flags, registry, schemas) are still fully guarded. It is still
// regenerated on `npm run docs:build`.
const result = spawnSync('diff', ['-ruN', '-x', 'changelog.md', committedDocs, tmpOut], {
  encoding: 'utf-8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.status === 0) {
  console.log('docs:check — clean. Committed docs match generators.');
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  process.exit(0);
}

console.error('docs:check — drift detected:');
console.error(result.stdout || '');
if (result.stderr) console.error(result.stderr);
console.error('\nRun `npm run docs:generate` and commit the result.');
fs.rmSync(tmpRoot, { recursive: true, force: true });
process.exit(1);
