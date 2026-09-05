// Official MCP Registry resolver.
//
// A catalog entry may carry a `registry` block naming its canonical record in
// the official registry (registry.modelcontextprotocol.io). This module turns
// that record into the fields dxai already understands — `transport`,
// `requiresEnv`, `requiresInput`, `version`, `stale` — so the rest of the CLI
// (config derivation, writers, doctor) never has to know the registry exists.
//
// Three callers share it: the maintainer-side sync script (keeps the bundled
// JSON current), `dxai update` (re-resolves live into the user's cache), and
// `dxai add <registry-name>` (resolves one server on the spot).
//
// Ownership rule: the resolver only writes the fields listed in
// `registry.resolved.fields`. On first resolution it claims every resolvable
// field the curated entry does not define. Delete a field to hand it back;
// to hand-curate an owned field, edit it and drop it from that list.

import { fetchJson } from '../net.js';
import {
  isPackageSpec, isHttpsUrl, isValidRegistryName, RESOLVABLE_FIELDS,
} from './validate.js';

export { RESOLVABLE_FIELDS };

export const OFFICIAL_MCP_REGISTRY =
  process.env.DXAI_MCP_REGISTRY_URL || 'https://registry.modelcontextprotocol.io';

const OFFICIAL_META_KEY = 'io.modelcontextprotocol.registry/official';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_CONCURRENCY = 4;

// ── Fetch ──

export function registryServerUrl(name, base = OFFICIAL_MCP_REGISTRY) {
  return `${base.replace(/\/$/, '')}/v0/servers/${encodeURIComponent(name)}/versions/latest`;
}

// The latest record for `name`, or null when the registry has never heard of it.
// Any other failure (network, 5xx, malformed) propagates.
export async function fetchRegistryServer(name, { base, fetchImpl = fetchJson, timeoutMs = DEFAULT_TIMEOUT_MS, retries } = {}) {
  if (!isValidRegistryName(name)) throw new Error(`Invalid registry server name: ${name}`);
  try {
    return await fetchImpl(registryServerUrl(name, base), { timeoutMs, retries });
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

// Substring search on server names (the only search the registry offers),
// latest versions only. Returns the `{ server, _meta }` envelopes.
export async function fetchRegistrySearch(query, { base = OFFICIAL_MCP_REGISTRY, fetchImpl = fetchJson, timeoutMs = DEFAULT_TIMEOUT_MS, retries, limit = 20 } = {}) {
  const url = `${base.replace(/\/$/, '')}/v0/servers?search=${encodeURIComponent(query)}&version=latest&limit=${limit}`;
  const data = await fetchImpl(url, { timeoutMs, retries });
  return Array.isArray(data?.servers) ? data.servers : [];
}

// ── Pick a transport out of a server.json record ──

const REMOTE_TYPES = ['streamable-http', 'sse'];
const PACKAGE_LAUNCHERS = {
  npm: (identifier) => ({ command: 'npx', args: ['-y', identifier] }),
  pypi: (identifier) => ({ command: 'uvx', args: [identifier] }),
};

function usableRemotes(remotes, prefer, warnings) {
  const valid = [];
  for (const r of remotes || []) {
    if (!REMOTE_TYPES.includes(r?.type)) continue;
    if (!isHttpsUrl(r.url)) { warnings.push(`remote ${r.url} skipped: not https`); continue; }
    valid.push(r);
  }
  valid.sort((a, b) => REMOTE_TYPES.indexOf(a.type) - REMOTE_TYPES.indexOf(b.type));
  if (prefer?.remote) {
    const matched = valid.filter((r) => r.url.includes(prefer.remote));
    if (matched.length) return matched;
    warnings.push(`no remote matches prefer.remote "${prefer.remote}"; using the first available`);
  }
  return valid;
}

function usablePackages(packages, warnings) {
  const valid = [];
  for (const p of packages || []) {
    if (!PACKAGE_LAUNCHERS[p?.registryType]) {
      if (p?.registryType) warnings.push(`package type "${p.registryType}" (${p.identifier}) is not supported yet`);
      continue;
    }
    if (!isPackageSpec(p.identifier)) { warnings.push(`package identifier "${p.identifier}" rejected`); continue; }
    if (p.transport && p.transport.type !== 'stdio') continue;
    valid.push(p);
  }
  return valid;
}

// Positional/named package arguments → argv tokens plus the inputs a user must
// supply. A required argument becomes a `{key}` placeholder that config-writer
// substitutes at write time (the same mechanism `filesystem` uses).
function packageArgv(args, requiresInput) {
  const argv = [];
  for (const a of args || []) {
    if (!a || typeof a !== 'object') continue;
    const key = a.valueHint || (a.name || '').replace(/^-+/, '');
    if (a.type === 'positional') {
      if (a.value && !/\{[^}]+\}/.test(a.value)) argv.push(a.value);
      else if (a.isRequired && key) {
        const placeholder = `{${key}}`;
        requiresInput[key] = { prompt: a.description || key, default: a.default, placeholder };
        argv.push(placeholder);
      }
    } else if (a.type === 'named' && a.name) {
      if (a.value && !/\{[^}]+\}/.test(a.value)) argv.push(a.name, a.value);
      else if (a.isRequired && key) {
        const placeholder = `{${key}}`;
        requiresInput[key] = { prompt: a.description || key, default: a.default, placeholder };
        argv.push(a.name, placeholder);
      }
    }
  }
  return argv;
}

function requiredEnv(pkg) {
  const out = {};
  for (const e of pkg.environmentVariables || []) {
    if (e?.name && e.isRequired === true) out[e.name] = e.description || e.name;
  }
  return out;
}

function requiredHeaders(remote) {
  return (remote.headers || []).filter((h) => h?.name && h.isRequired === true).map((h) => h.name);
}

// Map a registry record (the `{ server, _meta }` envelope or a bare server.json)
// onto dxai catalog fields. Remote-first unless `prefer.transport` says
// otherwise; never throws — problems land in `warnings`.
export function pickTransport(record, prefer = {}) {
  const server = record?.server || record || {};
  const official = record?._meta?.[OFFICIAL_META_KEY] || {};
  const warnings = [];
  const out = {
    name: server.name,
    title: server.title,
    description: server.description,
    registryVersion: server.version,
    status: official.status || 'active',
    transport: null,
    requiresEnv: {},
    requiresInput: {},
    version: undefined,
    stale: false,
    staleReason: undefined,
    source: null,
    warnings,
  };

  const remotes = usableRemotes(server.remotes, prefer, warnings);
  const packages = usablePackages(server.packages, warnings);
  const wantPackage = prefer.transport === 'package';

  let useRemote = wantPackage ? (packages.length === 0 && remotes.length > 0) : remotes.length > 0;
  if (useRemote && requiredHeaders(remotes[0]).length && prefer.transport !== 'remote' && packages.length) {
    warnings.push(`remote ${remotes[0].url} requires header(s) ${requiredHeaders(remotes[0]).join(', ')}; using the package instead`);
    useRemote = false;
  }

  if (useRemote) {
    const remote = remotes[0];
    out.transport = { type: 'http', url: remote.url };
    out.source = 'remote';
    out.version = server.version;
    if (remote.type === 'sse') warnings.push(`remote ${remote.url} is SSE; some clients need a transport hint`);
    const headers = requiredHeaders(remote);
    if (headers.length) warnings.push(`remote ${remote.url} requires header(s) ${headers.join(', ')} (not rendered)`);
  } else if (packages.length) {
    const pkg = packages[0];
    const launch = PACKAGE_LAUNCHERS[pkg.registryType](pkg.identifier);
    const argv = packageArgv(pkg.packageArguments, out.requiresInput);
    out.transport = { type: 'stdio', command: launch.command, args: [...launch.args, ...argv] };
    out.source = 'package';
    out.version = pkg.version || server.version;
    out.requiresEnv = requiredEnv(pkg);
  } else {
    warnings.push('no usable transport (no https remote, no npm/pypi package)');
  }

  if (official.status === 'deprecated' || official.status === 'deleted') {
    out.stale = true;
    out.staleReason = official.statusMessage || `Marked ${official.status} in the MCP registry`;
    warnings.push(`registry status is ${official.status}`);
  }
  return out;
}

// ── Apply a resolution to a catalog entry ──

function ownedFields(entry) {
  const owned = new Set(entry.registry?.resolved?.fields || []);
  for (const f of RESOLVABLE_FIELDS) if (!(f in entry)) owned.add(f);
  return owned;
}

function isEmpty(value) {
  if (value === undefined || value === null || value === false) return true;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function stripResolvedAt(entry) {
  const { registry, ...rest } = entry;
  if (!registry?.resolved) return rest;
  const { at: _at, ...resolved } = registry.resolved;
  return { ...rest, registry: { ...registry, resolved } };
}

// Return a new entry with the resolver-owned fields replaced by `resolution`
// and the `registry.resolved` bookkeeping refreshed. `changed` ignores the
// timestamp so a no-op sync produces no diff.
export function applyResolution(entry, resolution, { now = new Date() } = {}) {
  const owned = ownedFields(entry);
  const next = { ...entry };
  for (const field of RESOLVABLE_FIELDS) {
    if (!owned.has(field)) continue;
    if (isEmpty(resolution[field])) delete next[field];
    else next[field] = resolution[field];
  }
  next.registry = {
    ...entry.registry,
    resolved: {
      version: resolution.registryVersion,
      at: now.toISOString(),
      fields: RESOLVABLE_FIELDS.filter((f) => owned.has(f)),
    },
  };
  const changed = JSON.stringify(stripResolvedAt(entry)) !== JSON.stringify(stripResolvedAt(next));
  return { entry: next, changed };
}

// Catalog id derived from a registry name: the last path segment, slugified.
// "io.github.upstash/context7" → "context7", "com.figma.mcp/mcp" → "mcp".
export function slugForRegistryName(name) {
  const tail = String(name).split('/').pop() || '';
  return tail.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ── Resolve a whole catalog ──

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Re-resolve every entry that names a registry server. Entries without a
// `registry` block pass through untouched. Per-entry failures are captured in
// `results` and leave that entry as-is, so one bad record never sinks the
// catalog. Returns { entries, results }.
export async function resolveEntries(entries, opts = {}) {
  const { concurrency = DEFAULT_CONCURRENCY, now = new Date(), ...fetchOpts } = opts;
  const targets = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.registry?.name);
  const out = [...entries];
  const results = await mapLimit(targets, concurrency, async ({ e, i }) => {
    const name = e.registry.name;
    try {
      const record = await fetchRegistryServer(name, fetchOpts);
      if (!record) return { id: e.id, name, ok: false, error: 'not found in registry' };
      const resolution = pickTransport(record, e.registry.prefer);
      if (!resolution.transport && !('transport' in e)) {
        return { id: e.id, name, ok: false, error: 'no usable transport', warnings: resolution.warnings };
      }
      const { entry, changed } = applyResolution(e, resolution, { now });
      out[i] = entry;
      return { id: e.id, name, ok: true, changed, source: resolution.source, version: resolution.registryVersion, warnings: resolution.warnings };
    } catch (err) {
      return { id: e.id, name, ok: false, error: err.message };
    }
  });
  return { entries: out, results };
}
