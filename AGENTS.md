# AGENTS.md

> Single source of truth for all AI agents working in this repo.
> All agent-specific config files (CLAUDE.md, .cursorrules, copilot-instructions, etc.) point here.

## Project

**dxai** — Interactive CLI to bootstrap AI-powered dev environments across Cursor, Claude Code, VS Code/Copilot, Codex, Gemini CLI, Windsurf, and Antigravity. One command configures MCP servers, agent skills, cursor rules, and project instruction files in the right format for each tool.

## Tech Stack

- **Runtime**: Node.js 18+ (ES modules only, no CommonJS)
- **Language**: JavaScript (no TypeScript, but JSDoc is welcome)
- **CLI framework**: Commander.js v14
- **Interactive prompts**: Inquirer.js
- **Tests**: `node:test` + `node:assert/strict` — run `npm test` (don't hardcode the count here; it drifts)
- **Lint**: ESLint flat config (`eslint.config.mjs`) — run `npm run lint`
- **CI**: GitHub Actions (Ubuntu/macOS/Windows x Node 18/20/22; lint + docs-drift on Node 22)

## Architecture

```
bin/cli.js              → Commander entry point, exports buildProgram()
src/index.js            → Main orchestration: run(), apply(), saveProfileCmd()
src/config-writer.js    → All file writers (JSON, TOML, CLI, markdown)
src/config-remover.js   → Manifest-aware config removal
src/detect.js           → OS, agent, prerequisite detection
src/detect-project.js   → Stack, tooling, git, maturity inference
src/profile.js          → Profile load/merge/save/discovery
src/manifest.js         → Install manifest tracking (.dxai/manifest.json)
src/inspect.js          → list / status / doctor commands
src/update.js           → Remote registry refresh (refreshRegistry + dxai update)
src/auto-update.js      → Periodic TTL-based catalog auto-refresh on setup runs
src/cleanup.js          → Manifest-aware cleanup (prunes manifest on removal)
src/mcp-cmd.js          → Fast-path `dxai add` / `dxai remove` MCP commands
src/rollback.js         → dxai rollback — restore files from .bak.<ts> snapshots
src/runtime.js          → Option normalization
src/select.js           → Shared selection resolution (flag > defaults > prompt), catalog checkbox builder, confirm()
src/branding.js         → Banner, colors, message helpers, quiet()/startSpinner()/reportMcpResults()
src/net.js              → fetch with per-attempt timeout + retry/backoff (shared)
src/fs-atomic.js        → Atomic file writes (temp + rename), optional 0600 mode
src/registry/
  validate.js           → Validation for untrusted registry data (commands, repo/path, ids, registry blocks)
  loader.js             → Cache > bundled JSON resolution (DXAI_REGISTRY_SOURCE=bundled skips the cache)
  mcp-registry.js       → Official MCP Registry resolver: fetch a record, pick a transport, apply it to an entry
  mcp-servers.js        → MCP server catalog re-export
  skills.js             → Skills catalog re-export
  stacks.js             → Tech stacks, rules, template generators
  data/
    mcp-servers.json    → MCP server catalog (count lives in the JSON — don't cite numbers here, they drift)
scripts/registry-sync.mjs → Re-resolves registry-linked catalog entries; run weekly by the catalog-health workflow (opens a bot PR)
    skills.json         → Skills catalog
    automation-tools.json → Automation tool catalog
```

## Data Flow

1. **Detect** — OS, installed agents, prerequisites, project stack/tooling/maturity
2. **Collect** — Interactive prompts or CLI flags; resolve profile
3. **Validate** — Unknown IDs throw with "Known: ..." hint
4. **Write** — Merge configs, substitute placeholders, back up existing files, record manifest
5. **Record** — Entries written to `~/.dxai/manifest.json` (system) and `.dxai/manifest.json` (project)

## Commands

```
dxai system             # Global IDE configs, MCP servers, skills
dxai project            # Repo-local rules, CLAUDE.md, AGENTS.md, stack detection
dxai both               # System + project in one go
dxai init               # Alias for `dxai project`
dxai add <mcp...>       # Fast-path: add MCP server(s) to detected agents
dxai remove <mcp...>    # Fast-path: remove MCP server(s) (alias: rm)
dxai apply [profile]    # Non-interactive from a saved profile
dxai save-profile       # Persist selections as reusable profile
dxai list / status / doctor   # Manifest inspection and drift detection
dxai cleanup [scope]    # Remove dxai-managed configs (scope: system|project|both; supports -y/--json/--dry-run/--backups)
dxai rollback           # Restore files from their most recent .bak.<ts> backup
dxai update             # Refresh registry cache from remote
```

## Release & Versioning

The catalogue and the CLI code ship on **two independent tracks**. Most upstream
churn (a new MCP, a renamed package, a better description) touches only the data
track and needs no npm release.

- **Data track — catalogue JSON** (`src/registry/data/*.json`). Push to `main`.
  It reaches every user automatically within the auto-update TTL (7 days, see
  `src/auto-update.js`), or instantly via `dxai update`. **No `package.json`
  version bump.** Use for: new/changed servers, skills, automation tools;
  description edits; marking entries `stale`; pin bumps. Registry-linked MCP
  entries maintain themselves: the weekly `sync` job in `catalog-health.yml`
  re-resolves them from the official MCP Registry and opens a PR when something
  changed — review and merge, don't hand-edit resolver-owned fields.
- **Code track — npm package**. Bump `package.json` version + publish. **Only**
  when CLI *logic* changes: new commands, new agent support, schema/derivation
  changes, bug fixes. Cadence: semver, per feature — not per upstream release.

**Why you rarely "go back" per upstream release:** skills resolve by `repo` +
`path` (always latest source); URL-based MCPs self-update; `npx`-based MCPs float
to latest **unless** pinned via a server's `version` field.

### Version-pinning policy

Pin minimally. Set a server's `version` **only** when reproducibility genuinely
matters; otherwise omit it so `npx` floats to latest and upstream fixes flow with
no maintainer action. The `catalog-health` GitHub Action flags pins that have
drifted from npm `latest` and dead URLs, opening an issue — so the few pins that
exist surface themselves rather than rotting silently.

## Coding Conventions

- ES modules only — `import`/`export`, never `require()`
- One responsibility per file
- Destructuring over repeated property access
- `async/await` throughout — no raw callbacks or `.then()` chains
- Throw with context; catch specifically; validate at boundaries
- No `console.log` for debugging in committed code — use the branding helpers for user-facing output
- Quiet/loud modes: `--json` suppresses spinners, colors, and decorative text

## Testing Conventions

- Framework: `node:test` with `node:assert/strict`
- Run: `npm test` (or `node --test 'test/**/*.test.js'`). The runner sets
  `DXAI_REGISTRY_SOURCE=bundled`; run a single file the same way, or a stale
  `~/.dxai/cache` will stand in for the catalog in the repo
- Anything that spawns the CLI synchronously cannot serve it from the same
  process — put fixtures in `test/fixtures/*.mjs` and spawn them (see
  `fake-registry.mjs`, `fake-mcp-server.mjs`)
- Smoke: `npm run smoke`
- Pattern: temp directories, isolated file ops, no side effects
- Test names describe scenarios: "merges new server into existing config", not "test mergeJson"
- Mock at boundaries (filesystem), not between internal modules

## Key Rules

- Read 2-3 similar files before generating new code — match existing patterns
- No placeholder implementations (TODO without issue, empty function bodies)
- Dead code gets deleted, not commented out
- No hardcoded URLs, ports, secrets, or environment-specific values
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- One logical change per commit
- Config writes must be idempotent — merge, don't overwrite
- Back up existing config files before modifying them (only when the write actually changes something; snapshots are capped at 5 per file)
- Record all writes to the manifest for drift detection; skills are recorded by **id** (the on-disk directory name), never display name
- Setup/add flows must exit non-zero when any per-step write fails (`errorCount` plumbing in `src/index.js` / `src/mcp-cmd.js`)

## Agent-Specific Notes

### Template Generators (src/registry/stacks.js)

This file contains `buildAgentsMd()`, `buildClaudeMd()`, `buildGeminiMd()`, and `buildCursorRule()` — the functions that generate instruction files for *other* projects. Changes here affect every user's generated output. Test with multiple stack combinations before shipping.

### Registry Data (src/registry/data/)

JSON catalogs for MCP servers, skills, and automation tools.

**Adding an MCP server — prefer `transport`.** Declare the server's transport
once and let the per-agent config blocks be *derived* from `AGENT_DEFINITIONS`
(`src/detect.js#renderAgentConfig`, applied by `deriveConfigs` in
`src/registry/mcp-servers.js`):

```jsonc
{ "id": "context7", "transport": { "type": "http", "url": "https://…/mcp" } }
{ "id": "foo",      "transport": { "type": "stdio", "command": "npx", "args": ["-y", "@scope/pkg"] } }
```

Env vars are wired automatically from the server's `requiresEnv` keys. A new
agent added to `AGENT_DEFINITIONS` (with an `mcpDialect`) instantly supports every
transport-based server. Explicit `configs.<agent>` blocks still work and override
derivation per agent — an escape hatch for servers that don't fit the common
shapes. Migrate legacy explicit entries to `transport` opportunistically.

**Prefer linking to the official MCP Registry.** If the server has a record on
registry.modelcontextprotocol.io, the entry only needs curation fields plus a
`registry` block; the resolver (`src/registry/mcp-registry.js`) fills in
`transport` / `requiresEnv` / `requiresInput` / `stale`:

```jsonc
{ "id": "linear", "name": "Linear", "description": "…", "category": "productivity",
  "registry": { "name": "app.linear/linear" } }
{ "id": "cloudflare", "…": "…",
  "registry": { "name": "com.cloudflare.mcp/mcp", "prefer": { "remote": "bindings.mcp.cloudflare.com" } } }
```

Ownership rule: the resolver writes only the fields listed in
`registry.resolved.fields`; on first resolution it claims every resolvable field
the entry does not define. To hand-curate an owned field, edit it *and* remove
it from that list; delete a field to hand it back. `registry.prefer` takes
`transport` (`remote` default | `package`), `remote` (URL substring to pick one
of many), and `pin: true` (write the package version — off by default, pin
minimally). Remote-first; `oci`/`mcpb` packages and remotes that need auth
headers are not rendered yet. Run `node scripts/registry-sync.mjs --dry-run`
to see what a sync would change; find canonical names with
`GET https://registry.modelcontextprotocol.io/v0/servers?search=<name>&version=latest`
(search is a noisy substring match — verify the namespace is the vendor's).
`dxai add <registry-name>` resolves any registry server live for one run;
those are recorded in the manifest with their `registry` name and env var names.

**Validation is enforced.** `test/registry-schema.test.js` validates every entry
(ids, category refs, `requires*` shapes) and locks the derivation output via a
golden table. A typo in a config key or an unknown agent target now fails CI
instead of silently breaking a user's setup.

**Registry data is untrusted.** The catalog is fetched over the network
(cache-over-bundled) and only shape-checked on fetch, so any field that reaches a
shell/exec/URL sink must be validated via `src/registry/validate.js` first:
package/install commands run through `parseSafeCommand`/`isSafeSpawnSpec`
(allowlisted binary + clean package spec, no shell), tool `detectCommand` through
`isSafeBinaryName` (a bare binary name — it is probed via the shell), skill
`repo`/`path` through `isValidRepo`/`isValidSkillPath`, version refs through
`isSafeVersionRef`, map keys through `isSafeId`, registry names through
`isValidRegistryName`, and resolver-produced remotes through `isHttpsUrl`.
`dxai update` rejects a payload that fails `validateRegistryPayload` and falls
back to the bundled snapshot; live-resolved output is validated again before it
is cached, and a failure keeps the snapshot. Never interpolate registry values into an `execSync` shell string — use
`execFileSync` (argv form). Avoid shell pipes (`| head`, `| wc`) in any exec
call: they silently break under Windows cmd.exe — do the post-processing in JS.

### Profile System (src/profile.js)

Discovery chain: `./.dxai/profile.json` -> `~/.dxai/config.json` -> `~/.dxairc(.json)`. CLI flags always beat profile values. `PROFILE_KEYS` whitelist controls what's persisted.
