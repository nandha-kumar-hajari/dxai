// Runtime options + non-interactive helpers.
// Centralizes how we decide whether to prompt or use flag-provided values.

export function normalizeOptions(opts = {}) {
  const ci = process.env.CI === 'true' || process.env.CI === '1';
  const dryRun = !!opts.dryRun || process.env.DXAI_DRY_RUN === '1';
  const json = !!opts.json;
  // --yes implies non-interactive. CI=true also implies non-interactive (and json output).
  const yes = !!opts.yes || ci;
  const nonInteractive = yes;
  return {
    yes,
    ci,
    dryRun,
    json: json || ci,
    nonInteractive,
    agents: opts.agents,
    mcp: opts.mcp,
    skills: opts.skills,
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

// In non-interactive mode, abort with a clear message instead of hanging on a prompt.
export function requireValue(value, name, runtime) {
  if (runtime.nonInteractive && (value === undefined || value === null)) {
    throw new Error(`Non-interactive mode requires --${name} (or remove --yes/CI=true)`);
  }
}
