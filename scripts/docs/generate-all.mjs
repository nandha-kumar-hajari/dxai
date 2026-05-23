// Run every doc generator in scripts/docs/gen-*.mjs.
// Each generator is responsible for being idempotent and writing into
// docs/src/content/docs/. Phase 1 ships this orchestrator; later phases add
// the individual gen-* scripts.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('gen-') && f.endsWith('.mjs'))
  .sort();

if (files.length === 0) {
  console.log('docs:generate — no generators yet (waiting on later phases).');
  process.exit(0);
}

let failed = 0;
for (const f of files) {
  const url = pathToFileURL(path.join(dir, f)).href;
  process.stdout.write(`▸ ${f} ... `);
  try {
    const mod = await import(url);
    if (typeof mod.default === 'function') {
      await mod.default();
    }
    process.stdout.write('ok\n');
  } catch (err) {
    failed++;
    process.stdout.write('FAIL\n');
    console.error(err);
  }
}

process.exit(failed > 0 ? 1 : 0);
