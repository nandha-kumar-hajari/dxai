// ══════════════════════════════════════════════
// Agent Skills Registry
// ══════════════════════════════════════════════

export const SKILL_CATEGORIES = [
  { id: 'anthropic', label: '🔵 Anthropic Official' },
  { id: 'vercel', label: '▲ Vercel Labs' },
  { id: 'community', label: '🌍 Community' },
];

export const SKILLS = [
  // ── Anthropic Official ──
  // Repo: anthropics/skills — all skills live under skills/<name>/SKILL.md
  { id: 'frontend-design', name: 'Frontend Design', description: 'Production-grade UI with high design quality', category: 'anthropic', recommended: true, repo: 'anthropics/skills', path: 'skills/frontend-design' },
  { id: 'skill-creator', name: 'Skill Creator', description: 'Create, test, and optimize custom skills', category: 'anthropic', recommended: true, repo: 'anthropics/skills', path: 'skills/skill-creator' },
  { id: 'docx', name: 'Document (docx)', description: 'Professional Word document generation', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/docx' },
  { id: 'pdf', name: 'PDF', description: 'PDF creation, extraction, and manipulation', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/pdf' },
  { id: 'pptx', name: 'Presentation (pptx)', description: 'Slide deck and presentation creation', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/pptx' },
  { id: 'xlsx', name: 'Spreadsheet (xlsx)', description: 'Excel/spreadsheet generation', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/xlsx' },
  { id: 'algorithmic-art', name: 'Algorithmic Art', description: 'Generative art and creative coding', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/algorithmic-art' },
  { id: 'canvas-design', name: 'Canvas Design', description: 'HTML Canvas-based visual design', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/canvas-design' },
  { id: 'mcp-builder', name: 'MCP Server Builder', description: 'Build custom MCP servers', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/mcp-builder' },
  { id: 'webapp-testing', name: 'Web App Testing', description: 'Automated testing for web applications', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/webapp-testing' },
  { id: 'claude-api', name: 'Claude API', description: 'Build apps with the Claude API', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/claude-api' },
  { id: 'web-artifacts-builder', name: 'Web Artifacts Builder', description: 'Build interactive web artifacts', category: 'anthropic', repo: 'anthropics/skills', path: 'skills/web-artifacts-builder' },

  // ── Vercel Labs ──
  // Repo: vercel-labs/skills — skills live under skills/<name>/SKILL.md
  { id: 'find-skills', name: 'Find Skills', description: 'Discover and install agent skills', category: 'vercel', repo: 'vercel-labs/skills', path: 'skills/find-skills' },

  // ── Community ──
  { id: 'better-auth', name: 'Better Auth', description: 'Authentication best practices', category: 'community', repo: 'better-auth/skills', path: 'better-auth/best-practices' },
];

export function buildSkillChoices() {
  const choices = [];
  for (const cat of SKILL_CATEGORIES) {
    const catSkills = SKILLS.filter((s) => s.category === cat.id);
    if (catSkills.length === 0) continue;

    choices.push({ type: 'separator', line: `\n  ${cat.label}` });
    for (const s of catSkills) {
      const rec = s.recommended ? ' ★' : '';
      choices.push({
        name: `${s.name}${rec} — ${s.description}`,
        value: s.id,
        checked: !!s.recommended,
      });
    }
  }
  return choices;
}
