// Agent skills registry — data lives in data/skills.json.
// At import time we use the cache (if present) or fall back to bundled JSON.
// Run `dxai update` to refresh the cache from a remote source.

import { loadRegistry } from './loader.js';

const data = loadRegistry('skills');

export const SKILL_CATEGORIES = data.categories;
export const SKILLS = data.skills;
