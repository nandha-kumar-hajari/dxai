// Consolidated flag reference: all options from every subcommand, grouped by
// flag, showing which subcommands accept it. Useful when readers know they
// want a flag but don't remember which command takes it.

import { buildProgram } from '../../bin/cli.js';
import { writePage, mdTable } from './lib/render.mjs';

export default function generate() {
  const program = buildProgram();
  const subs = program.commands.filter((c) => !c._hidden);

  // Map flagSpec → { description, defaults, subcommands: Set }
  const byFlag = new Map();

  for (const cmd of subs) {
    for (const opt of cmd.options) {
      if (opt.hidden) continue;
      const key = opt.flags;
      if (!byFlag.has(key)) {
        byFlag.set(key, {
          flags: opt.flags,
          description: opt.description || '',
          defaults: opt.defaultValue,
          subcommands: new Set(),
        });
      }
      byFlag.get(key).subcommands.add(cmd.name());
    }
  }

  // Top-level options live on the program itself.
  const topRows = program.options
    .filter((o) => !o.hidden)
    .map((o) => ['`' + o.flags + '`', o.description || '—']);

  const flagRows = [...byFlag.values()]
    .sort((a, b) => a.flags.localeCompare(b.flags))
    .map((f) => [
      '`' + f.flags + '`',
      f.description || '—',
      [...f.subcommands].sort().map((s) => '`' + s + '`').join(', '),
      f.defaults !== undefined && f.defaults !== null ? '`' + JSON.stringify(f.defaults) + '`' : '—',
    ]);

  const sections = [];
  sections.push('Auto-generated flag reference. Pulled from every subcommand registered in `bin/cli.js`.');
  sections.push('');
  sections.push('## Top-level options');
  sections.push('');
  sections.push(mdTable(['Flag', 'Description'], topRows));
  sections.push('');
  sections.push('## Subcommand options');
  sections.push('');
  sections.push(mdTable(['Flag', 'Description', 'Available on', 'Default'], flagRows));
  sections.push('');

  sections.push('## Environment variables');
  sections.push('');
  sections.push('See [Environment Variables](/d3v-ai-cli/reference/env-vars/) for the full list.');

  writePage({
    relativePath: 'reference/flags.md',
    frontmatter: {
      title: 'Flags',
      description: 'Auto-generated flag reference across every dxai subcommand.',
    },
    sourceLabel: 'bin/cli.js (generator: scripts/docs/gen-flags.mjs)',
    body: sections.join('\n'),
  });
}
