// Validation for registry-supplied values that flow into shell/exec/URL sinks.
//
// The catalog is fetched over the network (cache-over-bundled, see loader.js) and
// is only shape-checked on fetch. Any field that ends up in a spawned command, an
// installed package name, or a fetch URL must be validated here first, so a
// poisoned or redirected registry cannot achieve command execution or repoint a
// fetch.

// owner/name — exactly two path-safe segments (e.g. "anthropics/skills").
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

// A skill's sub-path within its repo: "." or slash-separated safe segments,
// never absolute, never containing a ".." traversal segment.
const SKILL_PATH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

// npm package specifier (optionally scoped), no shell metacharacters.
const PACKAGE_SPEC_RE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;

// Same, but allowing a trailing `@version` (e.g. "@scope/pkg@1.2.3", "pkg@latest").
const PACKAGE_SPEC_VERSIONED_RE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.-]+)?$/i;

// Version / branch ref used to repoint the registry base URL. Path-safe, no
// traversal — a "../.." here would repoint the fetch at a different repo.
const VERSION_REF_RE = /^[A-Za-z0-9._-]+$/;

// Official MCP Registry server name: reverse-DNS namespace, one slash, name
// (schema pattern). E.g. "io.github.upstash/context7", "com.supabase/mcp".
const REGISTRY_NAME_RE = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

// Catalog fields the registry resolver may own (see mcp-registry.js). Anything
// else on an entry is curated by hand and never touched by a sync.
export const RESOLVABLE_FIELDS = ['transport', 'requiresEnv', 'requiresInput', 'version', 'stale', 'staleReason'];
const PREFER_TRANSPORTS = new Set(['remote', 'package']);

// A bare binary name (no path separators, no shell metacharacters). Used for
// registry fields that name a command to *probe* for (e.g. a tool's
// `detectCommand`) — probing must never be able to execute anything else.
const BINARY_NAME_RE = /^[A-Za-z0-9._-]+$/;

// Binaries we are willing to spawn from registry data. Everything else is a
// command we don't recognize and won't execute on the user's behalf.
const COMMAND_ALLOWLIST = new Set([
  'npx', 'node', 'npm', 'bunx', 'bun', 'pnpm', 'yarn', 'deno',
  'uvx', 'uv', 'pipx', 'pip', 'pip3', 'python', 'python3', 'docker', 'claude',
]);

export function isValidRepo(repo) {
  return typeof repo === 'string' && REPO_RE.test(repo);
}

export function isValidSkillPath(p) {
  if (typeof p !== 'string') return false;
  if (p === '.') return true;
  return SKILL_PATH_RE.test(p) && !p.split('/').includes('..');
}

export function isPackageSpec(tok) {
  return typeof tok === 'string' && PACKAGE_SPEC_RE.test(tok);
}

export function isAllowedCommand(cmd) {
  return typeof cmd === 'string' && COMMAND_ALLOWLIST.has(cmd);
}

export function isSafeVersionRef(v) {
  return typeof v === 'string' && VERSION_REF_RE.test(v) && !v.split('/').includes('..');
}

export function isSafeBinaryName(name) {
  return typeof name === 'string' && BINARY_NAME_RE.test(name);
}

export function isValidRegistryName(name) {
  return typeof name === 'string' && REGISTRY_NAME_RE.test(name);
}

// Registry-supplied remote URLs are written into user configs and probed by
// catalog-health; only accept https so a poisoned record can't point a client
// at a plaintext endpoint.
export function isHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// Shape-check an entry's optional `registry` block (the link to the official
// MCP Registry). Returns problem strings; empty when clean or absent.
export function validateRegistryBlock(id, block) {
  if (block === undefined) return [];
  const problems = [];
  if (!block || typeof block !== 'object') return [`server ${id}: registry must be an object`];
  if (!isValidRegistryName(block.name)) problems.push(`server ${id}: invalid registry name "${block.name}"`);
  const { prefer, resolved } = block;
  if (prefer !== undefined) {
    if (!prefer || typeof prefer !== 'object') problems.push(`server ${id}: registry.prefer must be an object`);
    else {
      if (prefer.transport !== undefined && !PREFER_TRANSPORTS.has(prefer.transport)) {
        problems.push(`server ${id}: registry.prefer.transport must be remote|package`);
      }
      if (prefer.remote !== undefined && typeof prefer.remote !== 'string') {
        problems.push(`server ${id}: registry.prefer.remote must be a string`);
      }
      if (prefer.pin !== undefined && typeof prefer.pin !== 'boolean') {
        problems.push(`server ${id}: registry.prefer.pin must be a boolean`);
      }
    }
  }
  if (resolved !== undefined) {
    if (!resolved || typeof resolved !== 'object' || !Array.isArray(resolved.fields)) {
      problems.push(`server ${id}: registry.resolved must carry a fields array`);
    } else {
      for (const f of resolved.fields) {
        if (!RESOLVABLE_FIELDS.includes(f)) problems.push(`server ${id}: registry.resolved.fields has unknown field "${f}"`);
      }
    }
  }
  return problems;
}

// Reject registry ids that could pollute Object.prototype when used as a map key.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export function isSafeId(id) {
  return typeof id === 'string' && id.length > 0 && !UNSAFE_KEYS.has(id);
}

// Split a registry-supplied install command string into argv for shell-free
// execution. Rejects any shell metacharacter so the string can never be
// interpreted as more than a single command + plain arguments. Throws on an
// unsafe command or a disallowed leading binary.
const SHELL_META_RE = /[;&|`$(){}<>\\"'*?~\n\r]/;
export function parseSafeCommand(str) {
  if (typeof str !== 'string' || !str.trim()) {
    throw new Error('empty command');
  }
  if (SHELL_META_RE.test(str)) {
    throw new Error(`command contains shell metacharacters: ${str}`);
  }
  const parts = str.trim().split(/\s+/);
  const [command, ...args] = parts;
  if (!isAllowedCommand(command)) {
    throw new Error(`command not in allowlist: ${command}`);
  }
  return { command, args };
}

// Validate a server's spawn/transport spec before it is executed (handshake) or
// recorded. Returns true only when the command is allowlisted and every npm
// package argument is a clean package spec.
// Defense-in-depth at the fetch boundary: vet a freshly-fetched registry payload
// before it is cached and trusted by every later run. Returns an array of problem
// strings (empty = clean). Each entry's id must be map-key-safe; command-bearing
// fields must use an allowlisted binary; skills' repo/path must be clean. A bad
// file is rejected wholesale (caller falls back to the bundled snapshot) rather
// than silently caching a poisoned entry.
export function validateRegistryPayload(listKey, items) {
  const problems = [];
  for (const item of items) {
    const id = item?.id;
    if (!isSafeId(id)) {
      problems.push(`entry with invalid id: ${JSON.stringify(id)}`);
      continue;
    }
    if (listKey === 'skills') {
      if (!isValidRepo(item.repo)) problems.push(`skill ${id}: invalid repo "${item.repo}"`);
      if (!isValidSkillPath(item.path)) problems.push(`skill ${id}: invalid path "${item.path}"`);
    } else if (listKey === 'tools') {
      for (const cmd of Object.values(item.installCommand || {})) {
        try { parseSafeCommand(cmd); }
        catch (err) { problems.push(`tool ${id}: ${err.message}`); }
      }
      // detectCommand is probed for existence on the user's PATH; a poisoned
      // value must not be able to smuggle anything past that probe.
      if (item.detectCommand !== undefined && !isSafeBinaryName(item.detectCommand)) {
        problems.push(`tool ${id}: detectCommand is not a bare binary name "${item.detectCommand}"`);
      }
    } else if (listKey === 'servers') {
      problems.push(...validateRegistryBlock(id, item.registry));
      const cmd = item.transport?.command;
      if (cmd !== undefined && !isAllowedCommand(cmd)) {
        problems.push(`server ${id}: transport command not allowlisted "${cmd}"`);
      }
      for (const [agent, cfg] of Object.entries(item.configs || {})) {
        if (cfg && typeof cfg.command === 'string' && cfg.command !== 'claude' && !isAllowedCommand(cfg.command)) {
          problems.push(`server ${id} (${agent}): command not allowlisted "${cfg.command}"`);
        }
      }
    }
  }
  return problems;
}

const PACKAGE_LAUNCHERS = new Set(['npx', 'bunx', 'uvx', 'pnpm']);
export function isSafeSpawnSpec(spec) {
  if (!spec || !isAllowedCommand(spec.command)) return false;
  const args = spec.args || [];
  if (!Array.isArray(args)) return false;
  // For npx/uvx-style launchers the package name is the payload — vet it.
  if (PACKAGE_LAUNCHERS.has(spec.command)) {
    const pkg = args.find((a) => typeof a === 'string' && !a.startsWith('-') && a !== 'dlx');
    if (pkg && !PACKAGE_SPEC_VERSIONED_RE.test(pkg)) return false;
  }
  return true;
}
