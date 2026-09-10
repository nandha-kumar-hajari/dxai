<p align="center">
  <img src="https://raw.githubusercontent.com/nandha-kumar-hajari/dxai/main/docs/public/og.png" alt="dxai — make your repo ready for every AI coding agent" width="640">
</p>

<p align="center">
  <strong>One command to make your repo ready for every AI coding agent.</strong>
</p>

`dxai` is an interactive CLI that configures **MCP servers**, **agent skills**, **Cursor rules and commands**, **project instruction files** (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`), and **AI-friendly project scaffolding** across **Cursor, Claude Code, VS Code / Copilot, OpenAI Codex, Gemini CLI, Google Antigravity, and Devin Desktop (formerly Windsurf)** — simultaneously and in the right format for each.

📚 **Full documentation:** <https://nandha-kumar-hajari.github.io/dxai/>

---

## Quick Start

```bash
npx dxai            # interactive menu
npx dxai system     # global IDE configs only
npx dxai project    # repo-local scaffolding only
npx dxai --yes      # accept defaults; non-interactive
npx dxai --help     # full usage
```

## Headline features

- **One config, every tool.** Pick an MCP server once and dxai writes the right format for every selected agent (JSON for Cursor / VS Code / Gemini / Antigravity / Devin, TOML for Codex, `claude mcp add` for Claude Code). The full per-agent map lives in [Supported Agents](https://nandha-kumar-hajari.github.io/dxai/reference/agents/).
- **Profiles for teams.** `dxai save-profile --here` writes `./.dxai/profile.json`. Teammates run `dxai apply` to get the same setup.
- **Drift-aware introspection.** `dxai list` / `status` / `doctor` read a manifest of installs, so cleanup is precise and PR review can spot config drift.
- **CI-ready.** Set `CI=true` (or pass `--yes`) for unattended runs. JSON output mode pipes into the rest of your tooling.
- **Backed by the official MCP Registry.** Catalog entries link to their record on [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io); a weekly sync keeps the bundled catalog current and `dxai update` re-resolves live. Any registry server can be added by name: `dxai add io.github.owner/server`.
- **Bundled + remote registry.** `dxai update` refreshes the MCP / skill catalog from a remote URL; bundled JSON is the offline fallback. Override the source with `DXAI_REGISTRY_URL`. Network calls (registry refresh, skill downloads) use native `fetch` with per-attempt timeouts and retry/backoff — no `curl` dependency.
- **Reversible.** Every write is backed up as `<file>.bak.<ts>`; `dxai rollback` restores the most recent snapshot (and snapshots the current file first, so it's undoable).

## Commands

| Command | What it does |
|---|---|
| `dxai system` | Global IDE configs, MCP servers, agent skills |
| `dxai project` | Repo-local AI scaffolding (rules, CLAUDE.md, AGENTS.md, etc.) |
| `dxai both` | System + project setup in one go |
| `dxai init` | Alias for `dxai project` (first-time project setup) |
| `dxai add <mcp...>` | Add MCP server(s) to detected agents — fast path, no wizard |
| `dxai remove <mcp...>` (alias `rm`) | Remove MCP server(s) from detected agents |
| `dxai apply [name]` | Run setup using a saved profile |
| `dxai save-profile [name]` | Save selections as a reusable profile |
| `dxai profiles` | List discoverable profiles |
| `dxai list` | Show what dxai installed (from manifest) |
| `dxai status` | Compare manifest with live config (drift detection) |
| `dxai doctor` | Validate dxai installation |
| `dxai update` | Refresh registry cache from remote |
| `dxai rollback` | Restore dxai-managed files from their most recent `.bak.<ts>` backup |
| `dxai cleanup [scope]` (alias `reset`) | Remove dxai-managed configs and files (`system`/`project`/`both`; supports `-y`, `--json`, `--dry-run`, `--backups`) |

Per-command pages with full options tables: [Reference / Commands](https://nandha-kumar-hajari.github.io/dxai/reference/commands/).

## Non-interactive / CI

```bash
dxai system --yes \
  --agents cursor,claude-code \
  --mcp github,playwright,context7

dxai project --yes \
  --stack react,node \
  --features cursor-rules,agents-md,editorconfig

CI=true dxai system --agents cursor --dry-run --json | jq .
```

Full flag table: [Reference / Flags](https://nandha-kumar-hajari.github.io/dxai/reference/flags/).

## Requirements

- **Node.js 18+** — verified in CI on Node 18, 20, 22.
- **npm** / **npx** (ships with Node).
- **Git** — recommended.

dxai is verified on **macOS, Linux, and Windows** in the GitHub Actions matrix.

---

## Setup, tests, and CI

```bash
git clone https://github.com/nandha-kumar-hajari/dxai.git
cd dxai
npm install
npm test                          # 143 tests, ~0.5s (node:test, no extra framework)
npm run smoke                     # quick --version + --help check
npm link                          # optional: simulate `npx dxai`
```

CI matrix runs on every push and PR across **Ubuntu, macOS, Windows × Node 18, 20, 22**:

1. `node --check` for every `.js` in `src/` and `bin/`
2. `npm test`
3. Smoke run of `dxai --version` and `dxai --help`
4. `npm run docs:check` (drift guard — fails if `bin/cli.js` flags or registry JSON change without regenerating docs)

## Documentation site

Built with **Astro + Starlight**. Sources live under `docs/`. Most pages are hand-written; registry tables, CLI reference, schema docs, and the changelog are auto-generated from source code.

```bash
npm run docs:install              # one-time: install docs deps
npm run docs:dev                  # dev server at http://localhost:4321
npm run docs:generate             # run all generators (idempotent)
npm run docs:build                # generators → astro build → docs/dist/
npm run docs:check                # drift guard (CI uses this)
npm run docs:preview              # preview built site
```

Auto-generated pages (regenerated by the generators in `scripts/docs/`):

| Page | Source |
|---|---|
| [Registry / MCP servers](https://nandha-kumar-hajari.github.io/dxai/registry/mcp-servers/) | `src/registry/data/mcp-servers.json` |
| [Registry / Skills](https://nandha-kumar-hajari.github.io/dxai/registry/skills/) | `src/registry/data/skills.json` |
| [Registry / Stacks](https://nandha-kumar-hajari.github.io/dxai/registry/stacks/) | `src/registry/stacks.js` (`TECH_STACKS`, `CURSOR_RULES`) |
| [Registry / Cursor commands](https://nandha-kumar-hajari.github.io/dxai/registry/cursor-commands/) | `src/registry/stacks.js` (`CURSOR_COMMANDS`) |
| [Reference / Commands](https://nandha-kumar-hajari.github.io/dxai/reference/commands/) | `bin/cli.js` (`buildProgram()`) |
| [Reference / Flags](https://nandha-kumar-hajari.github.io/dxai/reference/flags/) | `bin/cli.js` (`buildProgram()`) |
| [Reference / Profile schema](https://nandha-kumar-hajari.github.io/dxai/reference/profile-schema/) | `src/profile.js` (`PROFILE_KEYS`) |
| [Reference / Manifest schema](https://nandha-kumar-hajari.github.io/dxai/reference/manifest-schema/) | `src/manifest.js` (`emptyManifest`) |
| [Changelog](https://nandha-kumar-hajari.github.io/dxai/changelog/) | `git log` (conventional commits) |

The site also publishes `llms.txt` / `llms-full.txt` for AI-agent consumption (via `starlight-llms-txt`).

## Project structure

```
bin/cli.js                          # commander entry, exports buildProgram()
src/
  index.js                          # run / apply / saveProfileCmd / listProfilesCmd
  runtime.js                        # option normalization
  profile.js                        # profile load / merge / save / discovery
  manifest.js                       # manifest read / write / record helpers
  inspect.js                        # list / status / doctor
  update.js                         # update (remote registry refresh)
  auto-update.js                    # periodic TTL-based catalog refresh
  cleanup.js                        # cleanup / reset (manifest-aware)
  rollback.js                       # restore files from .bak.<ts> snapshots
  mcp-cmd.js                        # fast-path add / remove MCP commands
  config-writer.js                  # file writers + dry-run previews
  config-remover.js                 # scan + remove helpers
  net.js                            # fetch with timeout + retry/backoff
  fs-atomic.js                      # atomic writes (temp + rename)
  detect.js                         # OS, prerequisite, agent detection
  detect-project.js                 # stack / tooling / git inference
  branding.js                       # banner / colors / message helpers
  registry/
    mcp-servers.js                  # re-exports loaded via loader
    skills.js                       # re-exports loaded via loader
    stacks.js                       # tech stacks, Cursor rules, commands, templates
    loader.js                       # cache > bundled JSON resolution; remote fetch
    data/{mcp-servers,skills}.json  # bundled catalogs

test/                               # node:test suite (143 tests)
docs/                               # Astro + Starlight site
scripts/docs/                       # doc generators (gen-*.mjs + lib/render.mjs)
.github/workflows/                  # ci.yml + docs.yml
ROADMAP.md                          # tracked gaps and future work
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md). The Top 5 focus areas — bug fixes, non-interactive mode, profiles, manifest + introspection, remote registry + tests — are complete. Documentation site (this section) shipped on top of that.

## License

MIT
