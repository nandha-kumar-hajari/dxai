import { CURSOR_COMMANDS } from '../../src/registry/stacks.js';
import { writePage, mdTable } from './lib/render.mjs';

// Pull the first heading line ("# Title") and the first numbered step out of
// each command body for a tabular summary.
function summarize(body) {
  const lines = body.split('\n');
  const title = lines.find((l) => l.startsWith('# '))?.replace(/^#\s+/, '') ?? '';
  const firstStep =
    lines.find((l) => /^\s*1\.\s/.test(l))?.replace(/^\s*1\.\s+/, '') ?? '';
  return { title, firstStep };
}

export default function generate() {
  const sections = [];

  sections.push(
    'Pre-built Cursor slash commands installed by `dxai-cli project` when you enable the `cursor-commands` feature. Cursor retired `.cursor/commands/` in favour of skills, so each command lands in `.cursor/skills/<name>/SKILL.md` with `disable-model-invocation: true` — invoked explicitly as `/pr`, never picked up automatically.',
    '',
  );

  const rows = Object.entries(CURSOR_COMMANDS).map(([name, body]) => {
    const { title, firstStep } = summarize(body);
    return ['`/' + name + '`', '`' + name + '/SKILL.md`', title, firstStep];
  });

  sections.push('## Commands');
  sections.push('');
  sections.push(mdTable(['Slash command', 'File', 'Title', 'Step 1'], rows));
  sections.push('');

  sections.push('## Full bodies');
  sections.push('');
  sections.push('Each generated file is a Cursor command body. The full text is reproduced below for reference.');
  sections.push('');

  for (const [name, body] of Object.entries(CURSOR_COMMANDS)) {
    sections.push(`### \`/${name}\``);
    sections.push('');
    sections.push('```markdown');
    sections.push(body.trimEnd());
    sections.push('```');
    sections.push('');
  }

  writePage({
    relativePath: 'registry/cursor-commands.md',
    frontmatter: {
      title: 'Cursor Commands',
      description: `${Object.keys(CURSOR_COMMANDS).length} pre-built Cursor slash commands installed by dxai-cli project.`,
    },
    sourceLabel: 'src/registry/stacks.js (CURSOR_COMMANDS) — generator: scripts/docs/gen-cursor-commands.mjs',
    body: sections.join('\n'),
  });
}
