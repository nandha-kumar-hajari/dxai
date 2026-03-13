// ══════════════════════════════════════════════
// Agent Skills Registry
// ══════════════════════════════════════════════

export const SKILL_CATEGORIES = [
  { id: 'anthropic', label: '🔵 Anthropic Official' },
  { id: 'vercel', label: '▲ Vercel Labs' },
  { id: 'google', label: '🟢 Google Labs' },
  { id: 'openai', label: '⬡ OpenAI' },
  { id: 'community', label: '🌍 Community' },
];

export const SKILLS = [
  // ── Anthropic Official ──
  { id: 'frontend-design', name: 'Frontend Design', description: 'Production-grade UI with high design quality', category: 'anthropic', recommended: true, repo: 'anthropics/skills', path: 'frontend-design' },
  { id: 'skill-creator', name: 'Skill Creator', description: 'Create, test, and optimize custom skills', category: 'anthropic', recommended: true, repo: 'anthropics/skills', path: 'skill-creator' },
  { id: 'docx', name: 'Document (docx)', description: 'Professional Word document generation', category: 'anthropic', repo: 'anthropics/skills', path: 'docx' },
  { id: 'pdf', name: 'PDF', description: 'PDF creation, extraction, and manipulation', category: 'anthropic', repo: 'anthropics/skills', path: 'pdf' },
  { id: 'pptx', name: 'Presentation (pptx)', description: 'Slide deck and presentation creation', category: 'anthropic', repo: 'anthropics/skills', path: 'pptx' },
  { id: 'xlsx', name: 'Spreadsheet (xlsx)', description: 'Excel/spreadsheet generation', category: 'anthropic', repo: 'anthropics/skills', path: 'xlsx' },
  { id: 'algorithmic-art', name: 'Algorithmic Art', description: 'Generative art and creative coding', category: 'anthropic', repo: 'anthropics/skills', path: 'algorithmic-art' },
  { id: 'canvas-design', name: 'Canvas Design', description: 'HTML Canvas-based visual design', category: 'anthropic', repo: 'anthropics/skills', path: 'canvas-design' },
  { id: 'mcp-server', name: 'MCP Server Builder', description: 'Build custom MCP servers', category: 'anthropic', repo: 'anthropics/skills', path: 'mcp-server' },
  { id: 'webapp-testing', name: 'Web App Testing', description: 'Automated testing for web applications', category: 'anthropic', repo: 'anthropics/skills', path: 'webapp-testing' },

  // ── Vercel Labs ──
  { id: 'react-nextjs-perf', name: 'React/Next.js Performance', description: 'Optimize React & Next.js apps', category: 'vercel', recommended: true, repo: 'vercel-labs/skills', path: 'react-nextjs-performance' },
  { id: 'web-design', name: 'Web Design Guidelines', description: 'Modern web design patterns', category: 'vercel', repo: 'vercel-labs/skills', path: 'web-design-guidelines' },
  { id: 'react-native', name: 'React Native', description: 'React Native mobile development', category: 'vercel', repo: 'vercel-labs/skills', path: 'react-native' },
  { id: 'vercel-deploy', name: 'Vercel Deploy', description: 'Deploy to Vercel platform', category: 'vercel', repo: 'vercel-labs/skills', path: 'vercel-deploy' },

  // ── Google Labs ──
  { id: 'stitch-react', name: 'Stitch React Components', description: 'Design-to-React with Google Stitch', category: 'google', repo: 'nicholasgriffintn/skills', path: 'google-stitch-react-components' },
  { id: 'stitch-shadcn', name: 'Stitch shadcn/ui', description: 'Design-to-shadcn component mapping', category: 'google', repo: 'nicholasgriffintn/skills', path: 'google-stitch-shadcn-ui' },

  // ── OpenAI ──
  { id: 'cloudflare-deploy', name: 'Cloudflare Deploy', description: 'Deploy to Cloudflare Workers/Pages', category: 'openai', repo: 'nicholasgriffintn/skills', path: 'cloudflare-deploy' },
  { id: 'develop-web-game', name: 'Web Game Dev', description: 'Browser-based game development', category: 'openai', repo: 'nicholasgriffintn/skills', path: 'develop-web-game' },

  // ── Community ──
  { id: 'trail-of-bits', name: 'Trail of Bits Security', description: 'Security auditing and analysis', category: 'community', repo: 'trailofbits/skills', path: '.' },
  { id: 'better-auth', name: 'Better Auth', description: 'Authentication best practices', category: 'community', repo: 'better-auth/skill', path: '.' },
  { id: 'context-engineering', name: 'Context Engineering', description: 'Optimize AI context and prompts', category: 'community', repo: 'nicholasgriffintn/skills', path: 'context-engineering' },
  { id: 'recursive-decomp', name: 'Recursive Decomposition', description: 'Break complex tasks into subtasks', category: 'community', repo: 'nicholasgriffintn/skills', path: 'recursive-decomposition' },
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
