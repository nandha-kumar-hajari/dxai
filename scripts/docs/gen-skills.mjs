import { SKILLS, SKILL_CATEGORIES } from '../../src/registry/skills.js';
import { writePage, mdTable } from './lib/render.mjs';

export default function generate() {
  const sections = [];

  sections.push(
    'Skills are downloadable instruction packages that teach AI agents specialized capabilities. They\'re sourced from official and community GitHub repos and installed into your project.',
    '',
    'Pick skills in the wizard, or pass `--skills <id1>,<id2>` to `dxai system`. ★ marks recommended (pre-checked) entries.',
    '',
    'Skills are installed into `.cursor/skills/` if Cursor is selected, otherwise `.agents/skills/` in the project directory.',
    '',
  );

  for (const cat of SKILL_CATEGORIES) {
    const skills = SKILLS.filter((s) => s.category === cat.id);
    if (skills.length === 0) continue;

    sections.push(`## ${cat.label}`);
    sections.push('');

    const rows = skills.map((s) => {
      const id = '`' + s.id + '`';
      const name = (s.recommended ? '★ ' : '') + s.name;
      const repo = s.repo ? `[\`${s.repo}\`](https://github.com/${s.repo})` : '—';
      const path = s.path ? '`' + s.path + '`' : '—';
      return [id, name, s.description, repo, path];
    });

    sections.push(mdTable(['ID', 'Name', 'Description', 'Source repo', 'Path'], rows));
    sections.push('');
  }

  writePage({
    relativePath: 'registry/skills.md',
    frontmatter: {
      title: 'Skills',
      description: `${SKILLS.length} agent skills across ${SKILL_CATEGORIES.length} categories. Auto-generated from src/registry/data/skills.json.`,
    },
    sourceLabel: 'src/registry/data/skills.json (generator: scripts/docs/gen-skills.mjs)',
    body: sections.join('\n'),
  });
}
