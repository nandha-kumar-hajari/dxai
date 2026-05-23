// Walk the configured commander program and emit one MD page per subcommand.
// Hidden commands (e.g. the implicit interactive default) are skipped.

import { buildProgram } from '../../bin/cli.js';
import { writePage, mdTable } from './lib/render.mjs';

// Format a single Option as a table row tuple.
function rowForOption(opt) {
  const flags = '`' + opt.flags + '`';
  const desc = opt.description || '';
  const typeBits = [];
  if (opt.required) typeBits.push('required');
  if (opt.optional) typeBits.push('value');
  if (opt.argChoices?.length) typeBits.push('choices: ' + opt.argChoices.join(', '));
  if (opt.defaultValue !== undefined && opt.defaultValue !== null) {
    typeBits.push('default: `' + JSON.stringify(opt.defaultValue) + '`');
  }
  return [flags, desc, typeBits.length ? typeBits.join(', ') : '—'];
}

// Build a single command's MD body.
function renderCommand(cmd, parentName = 'dxai') {
  const fullName = `${parentName} ${cmd.name()}`;
  const aliases = cmd.aliases?.() ?? [];
  const args = cmd.registeredArguments ?? cmd._args ?? [];
  const usage = cmd.usage();

  const sections = [];
  sections.push(cmd.description());
  sections.push('');

  sections.push('## Synopsis');
  sections.push('');
  sections.push('```bash');
  sections.push(`${fullName} ${usage}`.trim());
  sections.push('```');
  sections.push('');

  if (aliases.length) {
    sections.push('## Aliases');
    sections.push('');
    sections.push(aliases.map((a) => '`' + `${parentName} ${a}` + '`').join(', '));
    sections.push('');
  }

  if (args.length) {
    sections.push('## Arguments');
    sections.push('');
    const rows = args.map((a) => {
      const name = a.required ? `<${a.name()}>` : `[${a.name()}]`;
      return ['`' + name + '`', a.description || '—'];
    });
    sections.push(mdTable(['Argument', 'Description'], rows));
    sections.push('');
  }

  const opts = cmd.options.filter((o) => !o.hidden);
  if (opts.length) {
    sections.push('## Options');
    sections.push('');
    sections.push(mdTable(['Flag', 'Description', 'Notes'], opts.map(rowForOption)));
    sections.push('');
  } else {
    sections.push('## Options');
    sections.push('');
    sections.push('_No subcommand-specific options. Top-level `--help` and `--version` apply._');
    sections.push('');
  }

  return sections.join('\n');
}

export default function generate() {
  const program = buildProgram();
  const subcommands = program.commands.filter((c) => !c._hidden);

  // Per-command pages.
  for (let i = 0; i < subcommands.length; i++) {
    const cmd = subcommands[i];
    const body = renderCommand(cmd);
    writePage({
      relativePath: `reference/commands/${cmd.name()}.md`,
      frontmatter: {
        title: `dxai ${cmd.name()}`,
        description: cmd.description(),
        sidebar: { order: i + 1 },
      },
      sourceLabel: 'bin/cli.js (generator: scripts/docs/gen-commands.mjs)',
      body,
    });
  }

  // Index page summarising all commands.
  const indexRows = subcommands.map((cmd) => {
    const name = '`dxai ' + cmd.name() + '`';
    const aliases = cmd.aliases?.() ?? [];
    const aliasNote = aliases.length ? ` (alias: \`${aliases.join(', ')}\`)` : '';
    const desc = cmd.description() + aliasNote;
    return [name, desc];
  });
  const indexBody = [
    'Every dxai subcommand. Each command page includes its full options table and synopsis.',
    '',
    mdTable(['Command', 'What it does'], indexRows),
  ].join('\n');

  writePage({
    relativePath: 'reference/commands/index.md',
    frontmatter: {
      title: 'Commands',
      description: 'Auto-generated reference for every dxai subcommand.',
      sidebar: { order: 0 },
    },
    sourceLabel: 'bin/cli.js (generator: scripts/docs/gen-commands.mjs)',
    body: indexBody,
  });
}
