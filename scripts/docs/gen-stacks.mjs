import { TECH_STACKS, CURSOR_RULES } from '../../src/registry/stacks.js';
import { writePage, mdTable } from './lib/render.mjs';

// Extract a one-line summary from a Cursor rule .mdc string by reading the
// `description:` field in its frontmatter, falling back to the first non-empty
// non-frontmatter line if needed.
function summarize(rule) {
  if (!rule) return '—';
  const fmMatch = rule.match(/^---([\s\S]*?)---/);
  if (fmMatch) {
    const desc = fmMatch[1].match(/description:\s*(.+)/);
    if (desc) return desc[1].trim();
  }
  const firstLine = rule.split('\n').find((l) => l.trim() && !l.trim().startsWith('---'));
  return firstLine ? firstLine.trim() : '—';
}

export default function generate() {
  const sections = [];

  sections.push(
    'Stacks dxai recognizes from your project. When you select stacks during `dxai project`, dxai writes a corresponding `.mdc` rule file into `.cursor/rules/` (in addition to a universal `general.mdc`).',
    '',
    'Pass `--stack <id1>,<id2>` for non-interactive runs. Detected stacks are pre-checked in the wizard.',
    '',
    'Detection signals: `package.json` dependencies (React/Vue/Svelte/Node/mobile), or manifest files (`pyproject.toml`, `go.mod`, `Cargo.toml`, `pubspec.yaml`).',
    '',
  );

  const rows = TECH_STACKS.map((s) => {
    const ruleFile = '`' + `${s.id}.mdc` + '`';
    const rule = CURSOR_RULES?.[s.id];
    return ['`' + s.id + '`', s.label, ruleFile, summarize(rule)];
  });

  sections.push('## Supported stacks');
  sections.push('');
  sections.push(mdTable(['ID', 'Label', 'Rule file', 'Conventions'], rows));
  sections.push('');

  sections.push('## Universal rules');
  sections.push('');
  sections.push('A `general.mdc` is always written, regardless of which stacks you pick. It covers planning, sequential thinking, conventional commits, error handling, and security defaults.');

  writePage({
    relativePath: 'registry/stacks.md',
    frontmatter: {
      title: 'Tech Stacks',
      description: `${TECH_STACKS.length} stacks recognized; each generates a stack-specific Cursor rule file.`,
    },
    sourceLabel: 'src/registry/stacks.js (TECH_STACKS, CURSOR_RULES) — generator: scripts/docs/gen-stacks.mjs',
    body: sections.join('\n'),
  });
}
