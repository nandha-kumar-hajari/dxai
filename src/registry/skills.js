// Agent skills registry — data lives in data/skills.json.
// At import time we use the cache (if present) or fall back to bundled JSON.
// Run `dxai update` to refresh the cache from a remote source.

import { loadRegistry } from './loader.js';

const data = loadRegistry('skills');

export const SKILL_CATEGORIES = data.categories;
export const SKILLS = data.skills;

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
