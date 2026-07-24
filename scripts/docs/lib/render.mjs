// Shared markdown rendering helpers for doc generators.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');

// Output base directory. Generators write under DXAI_DOCS_OUT when set
// (used by docs:check) or the default committed location otherwise.
export function docsOutDir() {
  return process.env.DXAI_DOCS_OUT || path.join(REPO_ROOT, 'docs', 'src', 'content', 'docs');
}

// Build a Starlight frontmatter block. `data` keys are written in stable order.
export function frontmatter(data) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      // Quote the value if it contains characters YAML treats specially.
      const needsQuotes = /[:\-?#&*!|>'"%@`,[\]{}]|^\s|\s$/.test(v);
      lines.push(`${k}: ${needsQuotes ? JSON.stringify(v) : v}`);
    } else if (typeof v === 'boolean' || typeof v === 'number') {
      lines.push(`${k}: ${v}`);
    } else if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${typeof item === 'string' ? JSON.stringify(item) : item}`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

// Markdown banner that points at the source so future readers know the
// page is regenerated and where to make edits.
export function autogenBanner(sourceLabel) {
  return [
    '<!--',
    'AUTO-GENERATED — do not edit by hand.',
    `Regenerate via: npm run docs:generate`,
    `Source: ${sourceLabel}`,
    '-->',
    '',
  ].join('\n');
}

// Render a markdown table. Cells are passed through `escapeCell`.
export function mdTable(headers, rows) {
  const escape = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
  const head = `| ${headers.join(' | ')} |`;
  const align = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(escape).join(' | ')} |`).join('\n');
  return [head, align, body].join('\n');
}

// Atomically write a file: only writes if the content differs, so timestamps
// only change when output actually changes (helps with drift check + caching).
export function writeIfChanged(absPath, content) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  if (fs.existsSync(absPath)) {
    const existing = fs.readFileSync(absPath, 'utf8');
    if (existing === content) return false;
  }
  fs.writeFileSync(absPath, content, 'utf8');
  return true;
}

// Convenience: write a generated page with frontmatter + banner + body.
export function writePage({ relativePath, frontmatter: fm, sourceLabel, body }) {
  const out = path.join(docsOutDir(), relativePath);
  const content = `${frontmatter(fm)}${autogenBanner(sourceLabel)}\n${body.trimEnd()}\n`;
  return writeIfChanged(out, content);
}
