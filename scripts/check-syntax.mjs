// Portable syntax check.
//
// Running `node --check` over every source file via an inline `node -e "..."`
// in CI is not portable: the shell that interprets the `run:` block differs per
// OS (bash on Linux/macOS, PowerShell on Windows), and PowerShell treats
// backticks as escapes and `$` as variable expansion — mangling the template
// literals in the inline script. Enumerate the files here and shell out to
// `node --check` from Node itself so the check runs identically everywhere.

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

const files = [
  ...walk(path.join(repoRoot, 'src')),
  ...walk(path.join(repoRoot, 'bin')),
];

let failed = 0;
for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

if (failed > 0) {
  console.error(`\nSyntax check failed for ${failed} file(s).`);
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} file(s).`);
