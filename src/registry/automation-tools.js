import { loadRegistry } from './loader.js';

const data = loadRegistry('automation-tools');

export const AUTOMATION_TOOL_CATEGORIES = data.categories;
export const AUTOMATION_TOOLS = data.tools;
