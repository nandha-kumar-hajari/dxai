import { normalizeAgentIds } from './detect.js';
// Runtime options + non-interactive helpers.
// Centralizes how we decide whether to prompt or use flag-provided values.

export function normalizeOptions(opts = {}) {
  const ci = process.env.CI === 'true' || process.env.CI === '1';
  const dryRun = !!opts.dryRun || process.env.DXAI_DRY_RUN === '1';
  const json = !!opts.json;
  // --yes implies non-interactive. CI=true also implies non-interactive (and json
  // output), and --json is machine-facing so it never prompts either.
  const yes = !!opts.yes || ci;
  const nonInteractive = yes || json;
  return {
    yes,
    ci,
    dryRun,
    json: json || ci,
    nonInteractive,
    // --no-update sets opts.update === false (commander negation).
    update: opts.update !== false,
    agents: opts.agents ? normalizeAgentIds(opts.agents) : opts.agents,
    mcp: opts.mcp,
    skills: opts.skills,
    tools: opts.tools,
    features: opts.features,
    stack: opts.stack,
  };
}

// Validate that user-supplied IDs exist in the registry. Returns { valid, invalid }.
export function partitionByKnown(ids, knownIds) {
  if (!ids || ids.length === 0) return { valid: [], invalid: [] };
  const set = new Set(knownIds);
  const valid = [];
  const invalid = [];
  for (const id of ids) {
    if (set.has(id)) valid.push(id);
    else invalid.push(id);
  }
  return { valid, invalid };
}
