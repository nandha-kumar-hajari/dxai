# dxai Roadmap

Tracking gaps and missing features for a modern AI dev-environment CLI. Items are grouped by priority. Check off as you ship.

---

## Top 5 (do these first)

### 1. Fix correctness bugs ✅ (mostly done)
- [x] **VS Code `globalMcpPath` returns relative path** — now resolves per-OS to `User/mcp.json` (`src/detect.js`).
- [x] **Wrong Gemini install command on macOS** — fixed to `npm install -g @google/gemini-cli` (`src/detect.js`).
- [x] **Filesystem MCP ships literal `/path/to/allowed`** — added `requiresInput` schema, prompt collects `allowedPath`, placeholders substituted at write time. `~` and `$HOME` are expanded.
- [x] **Claude Code `globalMcpPath` causing $HOME backup-scan noise** — backup scan now restricted to file-based agents and to siblings of the actual config file (`scanBackupFiles` rewritten in `src/config-remover.js`).
- [x] **Stale MCP packages** — `github` → official remote MCP `https://api.githubcopilot.com/mcp/`, `linear` → official remote MCP `https://mcp.linear.app/mcp` (both now URL/OAuth, env requirements dropped). `slack` and `gitlab` have no clean vendor remote yet, so they keep working but are marked `"stale": true` with a `staleReason`. `filesystem`/`memory`/`sequential-thinking` are still the official reference servers and were left as-is.
- [x] **Dead `globExists` helper** — removed from `src/detect-project.js`.
- [x] **Silent `catch {}` blocks (high-impact ones)** — JSON merge now refuses to overwrite malformed input; `scanJsonMcpConfig` warns on parse failure. Many remaining catches are intentional (file absence, missing git history); leaving them.

### 2. Non-interactive / CI mode + flags ✅
- [x] Adopted **commander** v14 — `bin/cli.js` rewritten with subcommands and shared options.
- [x] `--version` / `-v` wired to `package.json`.
- [x] Per-subcommand `--help` with examples block + env-var documentation.
- [x] Flags for unattended runs implemented: `--yes`/`-y`, `--agents`, `--mcp`, `--skills`, `--features`, `--stack`. Comma-separated values; unknown IDs throw with a "Known: ..." hint.
- [x] `CI=true` triggers non-interactive + JSON output (via `src/runtime.js`).
- [x] `--json` output mode emits structured results to stdout, suppresses banner/spinners/decorative text.
- [x] `--dry-run` (also `DXAI_DRY_RUN=1`) reports what would happen without writing files. Note: full registry-driven dry-run for every writer is part of #5.
- [x] Non-interactive defaults: detected agents → recommended MCPs/skills → all features. Detected stack falls back to `node`.

### 3. Config file + profiles ✅
- [x] Profile module (`src/profile.js`) with auto-discovery precedence: `./.dxai/profile.json` → `~/.dxai/config.json` → `~/.dxairc(.json)`.
- [x] CLI flags beat profile values; `--profile <nameOrPath>` resolves names against `~/.dxai/profiles/` and `./.dxai/`.
- [x] `dxai apply [name]` runs a saved profile non-interactively (also supports `--dry-run`, `--json`).
- [x] `dxai save-profile [name] --agents ... --mcp ...` writes to `~/.dxai/profiles/<name>.json`. Use `--here` to save as `./.dxai/profile.json` instead, or `--path <path>` for an explicit location.
- [x] `dxai profiles` lists discoverable profiles across user and project scopes.
- [x] `--no-profile` skips auto-discovery for one-off runs.

### 4. `list` / `status` / `doctor` + install manifest ✅
- [x] Manifest module (`src/manifest.js`) writes `.dxai/manifest.json` (project) and `~/.dxai/manifest.json` (system). Records agents, MCP servers per agent, skills, and project files with timestamps + version.
- [x] Writers in `src/index.js` call `recordSystemMcp`, `recordSystemSkills`, `recordProjectMcp`, `recordProjectFiles` after each successful step.
- [x] `dxai list` (`src/inspect.js`) — shows installed MCPs/skills/files per scope; `--json` for machine output.
- [x] `dxai status` — diffs manifest vs live config and reports both *missing* (removed by user) and *extra* (added outside dxai) entries, plus deleted project files. Exits clean when in sync.
- [x] `dxai doctor` — checks: configs parse, env vars set for installed servers, `npx` on PATH, project files still present. Exits 1 on errors.
- [x] `dxai cleanup` now consults the manifest first; falls back to scanning the full known-id set when no manifest exists (legacy installs). Won't blow away user-added entries when manifest is present.
- [x] **Handshake test** — `dxai doctor --handshake` (opt-in) spawns each installed stdio MCP server (`src/handshake.js`, via `child_process.spawn`), sends a JSON-RPC `initialize`, and verifies the reply within a per-server timeout. Remote/URL servers are reported as skipped; servers with unset `requiresEnv` are skipped with a warning. Plain `dxai doctor` stays fast and static.

### 5. Remote registry + tests/CI ✅
- [x] Registry data extracted to `src/registry/data/{mcp-servers,skills}.json`. JS modules now load from JSON via `src/registry/loader.js`.
- [x] Cache lookup at `~/.dxai/cache/<name>.json`; bundled JSON is the offline fallback. Reads stay synchronous so consumers don't need top-level await.
- [x] `dxai update` (`src/update.js`) — fetches remote registry, validates shape, writes cache, surfaces added/removed entries.
- [x] `DXAI_REGISTRY_URL` env var overrides the default remote base URL.
- [x] Unit tests via `node:test` covering: JSON/TOML merge, placeholder substitution, malformed-JSON refusal, backup-scan specificity, project detection (react/python/monorepo/scripts/eslint), profile resolve+merge+save+keys, manifest read/write/round-trip, runtime normalization, registry shape, `diffRegistry`, version pinning, `registryBaseFor`, the stdio handshake, and a CLI end-to-end spawn suite, and the catalog auto-refresh. **81 tests, all passing.**
- [x] GitHub Actions CI (`.github/workflows/ci.yml`): syntax check + tests + smoke run across **Ubuntu/macOS/Windows × Node 18/20/22**.
- [x] `--dry-run` now reports concrete previews (`previewMcpConfigs`): for each agent, the target file path, server IDs that would be added, and IDs already present. JSON output includes `previews`.
- [x] **Pinned MCP package versions + `--registry-version` flag.** Servers may carry an optional `version` field; `pinPackageVersion` (`src/config-writer.js`) appends `@<version>` to the npm specifier at write time across JSON/CLI/TOML configs (no-op when absent, so existing entries are unchanged). `filesystem`/`memory`/`sequential-thinking` are pinned. `dxai update` gained `--registry-version <ref>` (swaps the branch segment of the registry URL) and `--registry-url <url>` (overrides `DXAI_REGISTRY_URL`), resolved by `registryBaseFor` in `src/registry/loader.js`.
- [x] **End-to-end spawn integration test.** `test/cli.e2e.test.js` spawns `bin/cli.js` as a subprocess (`--version`, `--help`, `list --json`, `doctor --json`) in an isolated HOME/cwd; `test/handshake.test.js` exercises the JSON-RPC handshake against a fake stdio MCP fixture (ok / garbage / timeout / missing-binary paths). **81 tests, all passing** (was 42).

> **Top 5 complete.** All five workstreams (and their deferred sub-items) are now shipped.

---

## Recently shipped (outside the original Top 5)

- [x] **Automation tools** — `agent-browser` and `agent-device` are detected and installable. New `--tools` flag, an `automation-tools` registry catalog (`src/registry/data/automation-tools.json` + `src/registry/automation-tools.js`), and install logic in the runtime. `dxai update` refreshes the `automation-tools` registry alongside MCP servers and skills.
- [x] **Periodic catalog auto-refresh** (`src/auto-update.js`) — setup runs lazily refresh the registry cache on a TTL (default 7 days) so catalog improvements and pinned-version bumps reach users who never run `dxai update` manually. Because the catalog loads at import time, the refresh updates the on-disk cache for the *next* run and emits a dim one-line nudge now; offline failures degrade gracefully. Opt out with `--no-update` / `DXAI_NO_AUTO_UPDATE=1`; tune with `DXAI_UPDATE_TTL_DAYS` / `DXAI_UPDATE_TIMEOUT_MS`. Skipped automatically under `--json` and CI. `refreshRegistry` was extracted from `updateCmd` so both paths share one fetch/validate/cache loop.

---

## High-value follow-ups

### Argument parsing & UX
- [x] **`dxai add <mcp-id...>` / `dxai remove <mcp-id...>`** (`src/mcp-cmd.js`) — fast path, no wizard. Resolve target agents from `--agents` (validated) or detection, validate server IDs with a "Known: ..." hint, then write/remove directly. Honour `--project`, `--dry-run`, `--json`, and (add) `--yes`; reuse the setup writers, config-remover, and manifest (new `unrecordMcp` helpers prune on remove).
- [x] **`dxai init` alias** for first-time project setup (registered as an alias of `dxai project` in `bin/cli.js`).
- [ ] Surface env-var requirements interactively (offer to write a `.env`, integrate with macOS Keychain / 1Password CLI / `direnv`).
- [ ] Better `--help`: examples block, env var documentation, exit codes. (Examples block + env-var docs already shipped in the Top 5; exit-code documentation remains.)

### Security & robustness
- [x] **Replace `execSync('curl ...')` in `installSkills` with native `fetch`.** The manual SKILL.md fallback now uses `fetchText` (`src/net.js`) instead of shelling out to `curl` — no external binary, and a non-2xx response rejects instead of writing an error page to disk. `installSkills` is async; callers updated.
- [x] **Add timeouts + retry/backoff for network calls.** New `src/net.js` (`fetchWithRetry`/`fetchJson`/`fetchText`): per-attempt `AbortSignal.timeout`, bounded retries (default 2), exponential backoff. Retriable = timeout/abort/network-throw/5xx/429; other 4xx fail fast. The registry refresh routes through it; interactive `dxai update` gets the default retries, the background auto-refresh passes `retries: 0` so an offline host never stalls a run.
- [x] **`dxai rollback`** (`src/rollback.js`) — restores dxai-managed files (agent global configs + generated project files) from their most recent `.bak.<ts>` snapshot, snapshotting the current file first so the rollback is reversible. Supports `--list`, `--dry-run`, `--json`, `--yes`; interactive checkbox otherwise.
- [ ] Verify MCP packages: pin versions, surface npm provenance/audit info, warn on unsigned packages.
- [ ] Idempotent updates — let `mergeJsonMcpConfig` upgrade an existing entry to a new version instead of always skipping. (The per-server `version` field now exists; this is the missing "detect drift and upgrade" half.) **Deferred:** mutates possibly user-customized config, so it needs its own drift-detection + confirmation UX — tracked as a standalone change rather than bundled here.

### Generators
- [ ] Merge into existing `CLAUDE.md` / `AGENTS.md` instead of skipping when present (append a managed block with markers).
- [ ] Generators are stack-aware — extend `STACK_SIGNALS` with: Astro, SolidStart, Qwik, Deno, Bun runtime, Laravel/PHP, Ruby on Rails, Java/Kotlin/Spring, .NET.
- [ ] Read `.tool-versions` / `mise.toml` / `asdf` to pick up runtime versions.

### Maintainability
- [ ] Adopt TypeScript (or `// @ts-check` + JSDoc) — registry shape is a prime candidate for type checking.
- [ ] Add JSON Schema validation for registry entries; fail loudly on typos like `configs.vscode` vs `configs.vs-code`.
- [ ] Split `config-writer.js` (~540 LOC) per format: `writers/json.js`, `writers/toml.js`, `writers/claude-cli.js`.

### Coverage
- [ ] Add agents: **Aider, Continue, Cline, Zed AI, JetBrains AI Assistant, Copilot Workspace, Roo Code**.
- [ ] Add MCP servers: vendor-owned GitHub MCP, vendor-owned Slack MCP, Sentry, Stripe, AWS, GCP, Postgres (generic), MongoDB, Redis, Datadog, PostHog.

---

## Nice-to-haves

- [ ] Plugin API for third-party agent / MCP / skill definitions.
- [ ] Hooks: pre-setup / post-setup scripts defined in profile.
- [ ] Telemetry opt-in for anonymous usage stats (only if it informs the registry).
- [ ] i18n scaffolding (English-only today).
- [ ] Post-setup verification — actually launch each MCP server in a subprocess and confirm it speaks the protocol.
- [ ] `dxai diff` — show what would change in user files before applying.
- [ ] Snapshot/restore: `dxai snapshot` + `dxai restore <id>` for whole-environment rollback.
- [ ] Web UI / TUI alternative to inquirer prompts (e.g. Ink-based).

---

## Notes

- File paths in this doc reference the repo at the time of writing — verify before editing in case the code has moved.
- When picking up an item, convert it into a focused PR; don't bundle multiple top-level items together.
- Update this file as items ship (check the box, link the PR).
