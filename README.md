# dxai

```
  ██████╗ ██╗  ██╗ █████╗ ██╗
  ██╔══██╗╚██╗██╔╝██╔══██╗██║
  ██║  ██║ ╚███╔╝ ███████║██║
  ██║  ██║ ██╔██╗ ██╔══██║██║
  ██████╔╝██╔╝ ██╗██║  ██║██║
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝
  AI-Powered Dev Environment Setup
  Powered by D3V
```

> **One command to bootstrap your entire AI development environment.**

`dxai` is an interactive CLI that configures **MCP servers**, **agent skills**, **Cursor rules and commands**, **project instruction files**, and **AI-friendly project scaffolding** across all major AI coding tools — simultaneously and in the correct format for each.

It works with **Cursor, Claude Code, VS Code / GitHub Copilot, OpenAI Codex CLI, Gemini CLI, Windsurf, and Google Antigravity**.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Usage](#usage)
- [Commands](#commands)
- [Non-interactive / CI mode](#non-interactive--ci-mode)
- [Profiles](#profiles)
- [Introspection: list / status / doctor](#introspection-list--status--doctor)
- [Registry & `dxai update`](#registry--dxai-update)
- [System Setup](#system-setup-dxai-system)
- [Project Setup](#project-setup-dxai-project)
- [Supported Tools](#supported-tools)
- [MCP Servers](#mcp-servers)
- [Agent Skills](#agent-skills)
- [Tech Stacks & Cursor Rules](#tech-stacks--cursor-rules)
- [Cursor Commands](#cursor-commands)
- [Generated Project Files](#generated-project-files)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Setup, Tests, and CI](#setup-tests-and-ci)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [FAQ](#faq)

---

## Quick Start

```bash
npx dxai
```

You'll be prompted to choose what to set up:

```
? What would you like to set up?
❯ System  — global IDE configs, MCP servers, agent skills
  Project — AI-friendly project config (rules, CLAUDE.md, etc.)
  Both    — full system + project setup
```

Or run a specific mode directly:

```bash
npx dxai system     # global machine-level setup
npx dxai project    # project-level setup in current directory
npx dxai --help     # show usage
```

---

## Usage

```
Usage: dxai [options] [command]

Setup commands:
  system [options]               Global IDE configs, MCP servers, skills
  project [options]              Project-level setup (rules, CLAUDE.md, AGENTS.md, .editorconfig, …)
  both [options]                 Run system + project setup in one go
  apply [name|path]              Run setup using a saved profile (non-interactive)
  cleanup | reset                Remove dxai-managed configs, files, and skills

Profiles:
  save-profile [name]            Save current selections as a reusable profile
  profiles                       List discoverable profiles

Introspection:
  list                           Show what dxai installed (from manifest)
  status                         Diff manifest vs live configs (drift detection)
  doctor                         Validate dxai installation (configs parse, env vars, tools on PATH)

Registry:
  update                         Refresh registry cache (MCP servers, skills) from remote

Top-level options:
  -v, --version                  Print the version
  -h, --help                     Show usage. Each subcommand also has --help.
```

Both setup modes (`system`, `project`) start with the same shared steps:

1. **Environment detection** — identifies your OS, Node.js, Git, Python, and which AI tools are installed
2. **Agent selection** — multi-select which AI tools you use (pre-checks any it detects)
3. **Missing tool installer** — for tools you selected but don't have, shows install commands for your platform

After that, each mode runs its own flow.

---

## Commands

### `dxai` (interactive)

```bash
npx dxai
```

Prompts for system / project / both, then walks the wizard.

### `dxai system` / `dxai project` / `dxai both`

Runs the corresponding flow. With no flags, fully interactive. With flags or `--yes`, runs unattended (see [Non-interactive / CI mode](#non-interactive--ci-mode)).

### `dxai apply [name|path]`

Runs setup non-interactively from a saved profile. With no argument, auto-discovers from `./.dxai/profile.json` → `~/.dxai/config.json` → `~/.dxairc`.

### `dxai save-profile [name]`

Captures flag values into a profile file. Defaults to `~/.dxai/profiles/<name>.json`. Use `--here` to write `./.dxai/profile.json` instead, or `--path` for an explicit path.

### `dxai profiles`

Lists discoverable profiles across user and project scopes.

### `dxai list`

Shows what dxai installed at the system and project levels, sourced from the manifest.

### `dxai status`

Compares manifest with live config files. Reports drift in three flavors:

- **Missing** — recorded in manifest but absent from config (someone removed it)
- **Extra** — present in config but not recorded by dxai (added by hand or another tool)
- **File drift** — project files dxai created that have since been deleted

### `dxai doctor`

Health check. Verifies configs parse, required env vars are set, `npx` is on PATH, and project files referenced by the manifest still exist. Exits non-zero on errors.

### `dxai update`

Fetches the latest registry (MCP servers + skills) from the remote and writes a local cache. Reports added / removed entries vs. previously cached data. Override the source with `DXAI_REGISTRY_URL`.

### `dxai cleanup` (alias: `reset`)

Interactively removes dxai-managed configs, skills, and files. Consults the manifest first to be precise; falls back to scanning the full known-id set when no manifest is present (for installs that predate the manifest).

---

## Non-interactive / CI mode

Every setup command accepts flags to run unattended. Pass `--yes` (or set `CI=true`) to skip prompts entirely.

### Flags

| Flag | Applies to | Description |
|------|-----------|-------------|
| `-y, --yes` | setup commands | Skip prompts; use defaults / values from flags |
| `--agents <list>` | setup commands | Comma-separated agent IDs (`cursor,claude-code,vscode,codex,gemini,windsurf,antigravity`) |
| `--mcp <list>` | setup commands | Comma-separated MCP server IDs |
| `--skills <list>` | system, both | Comma-separated skill IDs |
| `--features <list>` | project, both | Comma-separated project feature IDs |
| `--stack <list>` | project, both | Comma-separated tech stack IDs |
| `--profile <nameOrPath>` | setup commands | Load a saved profile (name or path) |
| `--no-profile` | setup commands | Skip auto-discovery of project / user profiles |
| `--json` | most commands | Emit machine-readable JSON; suppress banner / spinners |
| `--dry-run` | setup commands | Preview changes without writing files |

Unknown IDs are rejected with a `Known: ...` hint.

### Environment variables

| Variable | Effect |
|----------|--------|
| `CI=true` | Forces non-interactive mode and JSON output |
| `NO_COLOR=1` | Disables ANSI colors (chalk-standard) |
| `DXAI_DRY_RUN=1` | Equivalent to `--dry-run` |
| `DXAI_REGISTRY_URL` | Override the default remote registry base URL used by `dxai update` |

### Examples

```bash
# Accept defaults — uses recommended MCPs + skills, all features.
dxai project --yes

# Pin exactly what to install.
dxai system -y \
  --agents cursor,claude-code \
  --mcp github,playwright,context7

# Project mode with explicit stack and features.
dxai project -y \
  --stack react,node \
  --features cursor-rules,agents-md,editorconfig

# CI pipeline run, JSON output, no writes.
CI=true dxai system --agents cursor --dry-run

# Pipe results into jq.
dxai project --yes --json --stack react | jq '.project.features'
```

### Dry-run output

`--dry-run` produces a per-agent preview of what *would* be added, what's already present, and which file would be touched:

```
▸ Dry run — no changes written
  Cursor (merge) → /Users/d3v/.cursor/mcp.json
    + would add: context7, sequential-thinking
    · already present: github
```

In `--json` mode, the preview is included under `system.previews`.

---

## Profiles

Profiles are reusable presets — handy for onboarding teammates with one command, locking down CI behavior, or saving your personal defaults.

### Profile file shape

```json
{
  "mode": "both",
  "agents": ["cursor", "claude-code"],
  "mcp": ["github", "playwright", "context7"],
  "skills": ["frontend-design"],
  "features": ["cursor-rules", "agents-md", "editorconfig"],
  "stack": ["react", "node"],
  "mcpInputs": {
    "filesystem": { "allowedPath": "~/Code" }
  }
}
```

Unknown keys are silently dropped (so older profiles keep working when new keys are added).

### Auto-discovery order

When you run a setup command without `--profile`, dxai looks in this order and uses the first match:

1. `./.dxai/profile.json`     (project-local — commit this for your team)
2. `~/.dxai/config.json`      (user-level)
3. `~/.dxairc` or `~/.dxairc.json`

Pass `--no-profile` to skip auto-discovery for a single run.

### Precedence

CLI flags **always beat** profile values. The profile only fills in keys that weren't passed on the command line. This lets you keep a profile as the baseline and override one or two settings ad-hoc.

### Common workflows

```bash
# Save your personal defaults to ~/.dxai/profiles/me.json
dxai save-profile me \
  --agents cursor,claude-code \
  --mcp github,playwright \
  --features cursor-rules,agents-md,editorconfig

# Apply that profile in any project.
cd ~/some-project
dxai apply me

# Save a project-local profile for your team (commit ./.dxai/profile.json).
dxai save-profile --here \
  --stack react,node \
  --features cursor-rules,agents-md \
  --mcp playwright

# A teammate clones the repo and runs:
dxai apply               # auto-loads ./.dxai/profile.json

# Or list what's available.
dxai profiles
```

---

## Introspection: list / status / doctor

dxai writes a manifest after each install so it knows exactly what it changed:

- **System manifest** — `~/.dxai/manifest.json` (MCP servers per agent, skills)
- **Project manifest** — `./.dxai/manifest.json` (project MCP, generated files)

Three commands read it:

```bash
dxai list           # what's installed (system + project)
dxai status         # drift between manifest and live config
dxai doctor         # validate install: configs parse, env vars, tools on PATH
```

`status` reports both **missing** entries (recorded but no longer in config) and **extra** entries (in config but not added by dxai). All three commands support `--json` for scripting. `doctor` exits 1 if any error-severity finding is reported.

The manifest also makes `dxai cleanup` precise — it will only remove things dxai actually installed, and won't blow away entries you added by hand.

---

## Registry & `dxai update`

The MCP server and skill catalog lives as JSON in `src/registry/data/`. At runtime, dxai resolves the registry in this order:

1. **Local cache** at `~/.dxai/cache/<name>.json` (written by `dxai update`)
2. **Bundled snapshot** shipped with the npm package

`dxai update` fetches the latest catalog from a remote URL, validates it, writes the cache, and reports the diff:

```
▸ Update — refreshing registry
  ℹ Source: https://raw.githubusercontent.com/Nandha-d3v/d3v-ai-cli/main/src/registry/data
  ✓ mcp-servers: cached (17 entries) → ~/.dxai/cache/mcp-servers.json
    + added: linear, browserbase
    - removed: gitlab
  ✓ skills: cached (14 entries) → ~/.dxai/cache/skills.json
```

To use a fork or a private mirror:

```bash
DXAI_REGISTRY_URL=https://my-cdn.example.com/dxai-registry dxai update
```

If the remote is unreachable, dxai always falls back to the bundled JSON — so you can run the CLI offline.

---

## System Setup (`dxai system`)

System mode configures **global, machine-level settings** that apply everywhere regardless of what project you're in.

### What it does

| Step | What happens |
|------|-------------|
| MCP Server Selection | Multi-select from 16+ servers across 8 categories. Configs are written to each tool's **global** config path (`~/.cursor/mcp.json`, `~/.codex/config.toml`, etc.) |
| Agent Skills Installation | Downloads skill packages from Anthropic, Vercel Labs, Google, OpenAI, and community repos |

### MCP config paths (global)

| Tool | Format | Path |
|------|--------|------|
| Cursor | JSON (`mcpServers`) | `~/.cursor/mcp.json` |
| Claude Code | CLI | `claude mcp add <name> ...` |
| VS Code / Copilot | JSON (`servers`) | `~/Library/Application Support/Code/User/mcp.json` (macOS) · `~/.config/Code/User/mcp.json` (Linux) · `%APPDATA%\Code\User\mcp.json` (Windows) |
| OpenAI Codex CLI | TOML (`mcp_servers`) | `~/.codex/config.toml` |
| Gemini CLI | JSON (`mcpServers`) | `~/.gemini/settings.json` |
| Windsurf | JSON (`mcpServers`) | `~/.codeium/windsurf/mcp_config.json` |
| Google Antigravity | JSON (`mcpServers`) | `~/.gemini/antigravity/mcp_config.json` |

Each tool uses a different config format and key name. `dxai` translates a single server selection into the correct format for every tool you selected.

---

## Project Setup (`dxai project`)

Project mode sets up **AI-friendly configuration inside your current working directory**. Everything it creates is meant to be committed to your repo so your whole team (and their AI agents) benefit.

### What it does

1. **Tech stack selection** — pick from React/Next.js, Vue/Nuxt, Svelte/SvelteKit, Python/FastAPI/Django, Node.js/Express, Go, Rust, React Native/Flutter
2. **Feature checklist** — interactively toggle which project configs to generate:

```
? Which project configs should we set up? (Space to toggle)
  ◉ Cursor Rules — stack-specific .mdc rule files
  ◉ Cursor Commands — /pr, /fix-issue, /review, /test-all, /refactor
  ◉ .cursorignore — exclude noise from AI context
  ◉ Project-level MCP — .vscode/mcp.json, .cursor/mcp.json
  ◉ CLAUDE.md / GEMINI.md — agent instruction files
  ◉ AGENTS.md — AI-context project overview
  ◉ .gitattributes — AI-friendly git config
  ◉ .editorconfig — consistent formatting
```

> Cursor-specific options (rules, commands, `.cursorignore`) only appear if Cursor is one of your selected tools.
> Project-level MCP only appears for tools that support project configs (Cursor, VS Code, Gemini).

3. **Project MCP server selection** — if you chose the project-level MCP option, you'll pick which servers to configure inside the repo (same server list as system mode, but writes to `.cursor/mcp.json`, `.vscode/mcp.json` in the project directory)

### Project-level MCP paths

| Tool | Project Config Path |
|------|-------------------|
| Cursor | `.cursor/mcp.json` |
| VS Code / Copilot | `.vscode/mcp.json` |
| Gemini CLI | `.gemini/settings.json` |

---

## Supported Tools

`dxai` auto-detects these tools and pre-selects any that are installed:

| Tool | Detection | Description |
|------|-----------|-------------|
| **Cursor** | `cursor` command | AI-first IDE (VS Code fork). Supports global + project MCP, rules, commands, `.cursorignore` |
| **Claude Code** | `claude` command | Anthropic's terminal AI agent. MCP configured via `claude mcp add` CLI |
| **VS Code / Copilot** | `code` command | VS Code with GitHub Copilot agent mode. Supports project-level MCP |
| **OpenAI Codex CLI** | `codex` command | OpenAI's terminal coding agent. MCP configured via TOML |
| **Gemini CLI** | `gemini` command | Google's terminal AI agent. Supports global + project MCP |
| **Windsurf** | `windsurf` command | Codeium's AI IDE. Global MCP via JSON |
| **Google Antigravity** | `agy` command | Google's agent-first AI IDE. Global MCP via JSON |

If a selected tool is not installed, `dxai` shows platform-specific install commands:

```
  ⚠ Not installed: Claude Code, Codex
  Cursor:      brew install --cask cursor
  Claude Code: brew install claude-code
  Codex:       npm install -g @openai/codex
```

---

## MCP Servers

MCP (Model Context Protocol) servers give AI agents access to external tools and data sources. The wizard presents servers organized by category, with recommended ones pre-selected.

### Available Servers

| Category | Server | Description | Needs API Key |
|----------|--------|-------------|:---:|
| **Essential** | Context7 ★ | Live, version-specific library documentation | |
| | Sequential Thinking ★ | Multi-step structured reasoning | |
| **Code & Git** | GitHub ★ | PRs, issues, repos, code search | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| | GitLab | Merge requests, issues, pipelines | `GITLAB_TOKEN` |
| | Claude Code as MCP | Use Claude Code as a sub-agent in other editors | |
| **Design** | Figma | Design-to-code from Figma components | |
| **Productivity** | Notion | Read/write Notion pages and databases | |
| | Slack | Search messages, channels, notifications | `SLACK_BOT_TOKEN` |
| | Linear | Issues, projects, cycles management | `LINEAR_API_KEY` |
| **Database** | Supabase | Database, auth, storage | `SUPABASE_ACCESS_TOKEN` |
| | Neon Postgres | Serverless Postgres | `NEON_API_KEY` |
| **Browser & Testing** | Playwright ★ | Browser automation, E2E testing, screenshots | |
| | Browserbase | Cloud browser sessions | `BROWSERBASE_API_KEY` |
| **Cloud & Deploy** | Vercel | Deploy, manage projects, domains | `VERCEL_TOKEN` |
| | Cloudflare | Workers, Pages, DNS, R2 storage | |
| **Advanced** | Filesystem | Secure file access outside project root | |
| | Memory | Persistent memory across agent sessions | |

★ = recommended (pre-selected in the wizard)

Servers requiring API keys will show a reminder at the end of setup with the environment variables you need to set.

---

## Agent Skills

Skills are downloadable instruction packages that teach AI agents specialized capabilities. They're sourced from official and community GitHub repos and installed into your project.

### Available Skills

| Source | Skill | Description |
|--------|-------|-------------|
| **Anthropic** | Frontend Design ★ | Production-grade UI with high design quality |
| | Skill Creator ★ | Create, test, and optimize custom skills |
| | Document (docx) | Professional Word document generation |
| | PDF | PDF creation, extraction, and manipulation |
| | Presentation (pptx) | Slide deck and presentation creation |
| | Spreadsheet (xlsx) | Excel/spreadsheet generation |
| | Algorithmic Art | Generative art and creative coding |
| | Canvas Design | HTML Canvas-based visual design |
| | MCP Server Builder | Build custom MCP servers |
| | Web App Testing | Automated testing for web applications |
| | Claude API | Build apps with the Claude API |
| | Web Artifacts Builder | Build interactive web artifacts |
| **Vercel Labs** | Find Skills | Discover and install agent skills |
| **Community** | Better Auth | Authentication best practices |

★ = recommended (pre-selected)

Skills are installed to `.cursor/skills/` (if Cursor is selected) or `.agents/skills/` otherwise. The installer tries `npx skills install` first, then falls back to downloading `SKILL.md` from the source repo.

---

## Tech Stacks & Cursor Rules

When you select tech stacks during project setup, `dxai` generates stack-specific `.mdc` rule files in `.cursor/rules/`. These files teach Cursor's AI the conventions, patterns, and best practices for your stack.

### Supported Stacks

| Stack | Rule File | Key Conventions |
|-------|-----------|----------------|
| React / Next.js / TypeScript | `react.mdc` | Server Components by default, App Router, Tailwind, shadcn/ui, Zod validation, `use context7` for docs |
| Vue / Nuxt | `vue.mdc` | Composition API with `<script setup>`, Pinia, VueUse, auto-imports |
| Svelte / SvelteKit | `svelte.mdc` | Svelte 5 runes (`$state`, `$derived`, `$effect`), form actions, load functions |
| Python / FastAPI / Django | `python.mdc` | Python 3.11+, type hints, Pydantic v2, pytest, Ruff, async/await |
| Node.js / Express | `node.mdc` | TypeScript strict, ES modules, Zod/Joi validation, Drizzle/Prisma |
| Go | `go.mdc` | Standard layout (`cmd/`, `internal/`), error wrapping with `%w`, golangci-lint, slog |
| Rust | `rust.mdc` | `thiserror`/`anyhow`, Axum, serde, Clippy with `-D warnings` |
| React Native / Flutter | `mobile.mdc` | Expo, React Navigation v7, Zustand/React Query, BLoC/Riverpod |

A `general.mdc` rule file is always created with universal best practices (plan mode, sequential thinking, conventional commits, error handling).

---

## Cursor Commands

Pre-built Cursor custom commands installed to `.cursor/commands/`:

| Command | File | What it does |
|---------|------|-------------|
| `/pr` | `pr.md` | Stage changes, commit with conventional message, push, create a PR via `gh` |
| `/fix-issue` | `fix-issue.md` | Fetch a GitHub issue by number, find relevant code, implement fix, write tests, create a PR |
| `/review` | `review.md` | Lint changed files, run tests, check for unused imports, missing types, hardcoded values, missing tests |
| `/test-all` | `test-all.md` | Auto-detect test framework, run full suite, analyze failures, suggest fixes |
| `/refactor` | `refactor.md` | Analyze a file/directory for code smells, propose plan, implement step-by-step with tests |

---

## Generated Project Files

### `CLAUDE.md`

Project instructions for Claude Code. Auto-generated with your selected tech stack, sections for code style, testing, git workflow, MCP usage, and important paths. Created when Claude Code is one of your selected tools.

### `GEMINI.md`

Project context file for Gemini CLI. Lighter version of `CLAUDE.md` with stack info, conventions, and key directories. Created when Gemini CLI is one of your selected tools.

### `AGENTS.md`

A universal project context scaffold designed to be read by **any** AI agent. Contains placeholder sections you fill in:

- **Project Overview** — what the project does and who it's for
- **Tech Stack** — auto-populated from your selection
- **Architecture** — high-level codebase structure
- **Key Commands** — install, dev, test, build, lint
- **Conventions** — commit style, testing requirements, validation patterns
- **Gotchas** — things an AI agent might get wrong without context
- **Environment Variables** — required vars and where to get them

### `.gitattributes`

AI-friendly git configuration:

- `linguist-generated=true` on lock files (suppresses them from diffs and stats)
- Diff drivers for markdown, CSS, and HTML
- Binary markers for images, fonts, PDFs, and archives
- `merge=ours` strategy on lock files to reduce rebase conflicts
- `text=auto eol=lf` for consistent line endings

### `.editorconfig`

Consistent formatting across all editors and AI agents:

- 2-space indent by default, 4-space for Python and Rust, tabs for Go and Makefiles
- UTF-8 charset, LF line endings
- Trim trailing whitespace (except in Markdown)
- Insert final newline

### `.cursorignore`

Excludes noisy files from Cursor's AI context:

- `node_modules/`, `dist/`, `build/`, `.next/`, `__pycache__/`
- `.env`, `.env.local`, `.env.production`
- `.idea/`, `.DS_Store`, `Thumbs.db`
- `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`

---

## How It Works

### Config merging

All config writes are **merge-based and idempotent**. If a config file already exists, `dxai`:

1. Creates a timestamped backup (e.g., `mcp.json.bak.2025-01-15T10-30-00`)
2. Reads the existing config
3. Adds only servers/entries that don't already exist
4. Writes the merged result

Existing entries are never modified or overwritten. This means you can safely re-run the tool to add more servers or skills.

### File creation

Project files (`CLAUDE.md`, `AGENTS.md`, `.gitattributes`, etc.) are only created if they **don't already exist**. If the file is present, it's skipped with an info message. This prevents overwriting any customizations you've made.

### Cross-tool translation

Each MCP server in the registry has per-tool config variants. A single selection like "GitHub" translates to:

- **Cursor/VS Code/Windsurf/Gemini/Antigravity**: JSON object with `command`, `args`, `env`
- **Codex CLI**: TOML block with `[mcp_servers.github]`
- **Claude Code**: `claude mcp add github -- npx -y @modelcontextprotocol/server-github`

You select once, and every tool gets the right format.

---

## Requirements

- **Node.js 18+** (required)
- **npm** or **npx** (required, comes with Node.js)
- **Git** (recommended — needed for skills installation fallback)

---

## Setup, Tests, and CI

### 1. Install dependencies

```bash
git clone https://github.com/Nandha-d3v/d3v-ai-cli.git
cd d3v-ai-cli
npm install
```

### 2. Run from source

```bash
node bin/cli.js                    # interactive mode
node bin/cli.js system             # system setup only
node bin/cli.js project --yes      # non-interactive project setup
node bin/cli.js --help             # full usage
node bin/cli.js system --help      # subcommand help with flags
```

### 3. Link globally (simulates `npx dxai`)

```bash
npm link
```

This creates a global symlink so you can run `dxai` from any directory:

```bash
cd ~/some-real-project
dxai                          # interactive
dxai apply --dry-run          # auto-load ./.dxai/profile.json, preview only
dxai doctor --json            # health check (machine-readable)
```

Unlink when done:

```bash
npm unlink -g dxai
```

### 4. Run the test suite

dxai uses Node's built-in test runner — no extra test framework required.

```bash
npm test                      # 42 tests, ~100ms
npm run smoke                 # quick `--version` + `--help` smoke check
```

Tests cover JSON / TOML config merging, placeholder substitution, malformed-JSON refusal, backup-scan specificity, project detection (React / Python / monorepo / package-manager / ESLint), profile resolve / merge / save, manifest read / write / round-trip, runtime option normalization, and registry shape + diffing.

To target a single test file:

```bash
node --test test/runtime.test.js
```

### 5. Continuous integration

The repo ships a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on every push and pull request to `main`. The matrix is:

- **OS:** Ubuntu, macOS, Windows
- **Node:** 18, 20, 22

Each job runs:

1. `node --check` against every `.js` file in `src/` and `bin/` (syntax check)
2. `npm test`
3. Smoke run of `dxai --version` and `dxai --help`

If you fork the repo and want CI on your fork, no extra setup is needed — Actions runs out of the box.

### Tips

- **Safe to re-run** — config writes are merge-based; existing entries are never modified.
- **Project mode uses `cwd`** — run it from inside the project you want to configure.
- **System mode writes to `~`** — touches global config files like `~/.cursor/mcp.json`.
- **Backups** — any existing config file is backed up with a timestamp before modification (e.g., `mcp.json.bak.2025-01-15T10-30-00`).
- **Use `--dry-run`** when iterating to see exactly what would change.
- **Use `dxai status`** after manual edits to see drift between the manifest and your live config.

---

## Project Structure

```
bin/
  cli.js                          # CLI entry (commander-based subcommands + flags)

src/
  index.js                        # Setup orchestration: run / apply / saveProfile / listProfiles
  branding.js                     # Banner, colors, message helpers
  runtime.js                      # Option normalization (CI / yes / json / dry-run)
  profile.js                      # Profile load / merge / save / discovery
  manifest.js                     # ~/.dxai + ./.dxai manifest read / write / record helpers
  inspect.js                      # `list`, `status`, `doctor` commands
  update.js                       # `update` command (remote registry refresh)
  cleanup.js                      # `cleanup` / `reset` flow (manifest-aware)
  config-writer.js                # File writers + dry-run previews (JSON / TOML / Claude CLI)
  config-remover.js               # Scan + remove helpers used by cleanup / status
  detect.js                       # OS, prerequisite, and agent detection
  detect-project.js               # Stack / monorepo / tooling / git inference for cwd
  registry/
    mcp-servers.js                # Re-export MCP servers loaded via the loader
    skills.js                     # Re-export skills loaded via the loader
    stacks.js                     # Tech stacks, Cursor rules, commands, templates
    loader.js                     # cache > bundled JSON resolution; remote fetch helper
    data/
      mcp-servers.json            # Bundled MCP catalog (source of truth for releases)
      skills.json                 # Bundled skills catalog

test/
  runtime.test.js                 # Option normalization + ID partitioning
  profile.test.js                 # Profile resolve / read / merge / save
  manifest.test.js                # Manifest schema + round-trip
  config-writer.test.js           # JSON / TOML merge, placeholders, backups, malformed JSON
  config-remover.test.js          # Scan + remove + project file discovery
  detect-project.test.js          # Stack / monorepo / pkg-manager / linter detection
  registry-loader.test.js         # Bundled registry shape + diffRegistry

.github/workflows/
  ci.yml                          # Lint + tests + smoke across Ubuntu/macOS/Windows × Node 18/20/22

ROADMAP.md                        # Tracked gaps and future work (Top 5 done)
```

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for shipped work and what's planned next.

The five focus areas — **bug fixes, non-interactive mode, profiles, manifest + introspection, remote registry + tests** — are complete. The high-value follow-ups (more agents, vendor-owned MCPs, plugin API, secret-manager integration, post-setup MCP handshake) are listed in the same file.

---

## FAQ

**Can I run it multiple times?**
Yes. It's idempotent. Existing configs are merged, not overwritten. Existing project files are skipped.

**Does it modify my existing MCP configs?**
It adds new server entries but never changes or removes existing ones. A timestamped backup is created before any modification (e.g., `mcp.json.bak.2025-01-15T10-30-00`).

**What if I don't have all the AI tools installed?**
Select the ones you plan to use. The tool will generate configs for them and show install commands for anything not yet on your machine. You can continue setup without having them installed.

**Where do skills get installed?**
Into `.cursor/skills/` if Cursor is selected, otherwise `.agents/skills/` in the project directory.

**Can I use system and project setup separately?**
Yes. Run `dxai system` for just global configs, or `dxai project` for just the current project. They're fully independent flows that share the same agent detection and selection step. Or run `dxai both` to do both in one go.

**What config formats does it handle?**
JSON (Cursor, VS Code, Gemini, Windsurf, Antigravity), TOML (Codex CLI), and CLI commands (Claude Code). The translation is automatic.

**Can I run it in CI?**
Yes. Set `CI=true` (or pass `--yes`) and provide selections via flags or a profile. JSON output is emitted to stdout for piping. Example: `CI=true dxai system --agents cursor --mcp github,playwright`.

**How do I share a setup with my team?**
Save a project-local profile and commit it: `dxai save-profile --here --agents cursor,claude-code --mcp github,playwright --features cursor-rules,agents-md`. Teammates can then run `dxai apply` to get the same environment.

**Where does dxai store its state?**

- `~/.dxai/profiles/` — saved user profiles
- `~/.dxai/manifest.json` — record of system-level installs
- `~/.dxai/cache/` — cached registry from `dxai update`
- `./.dxai/profile.json` — project-local profile (commit this)
- `./.dxai/manifest.json` — record of project-level installs (commit if you want drift tracking in PR review)

**How do I see what dxai installed?**
`dxai list` (human-readable) or `dxai list --json`. `dxai status` shows drift; `dxai doctor` validates the install.

**The registry is missing a server I want.**
Three options: open a PR adding it to `src/registry/data/mcp-servers.json`, host your own registry and point `DXAI_REGISTRY_URL` at it, or write the entry directly into your tool's config file (dxai will leave hand-added entries alone).

**Can I uninstall everything dxai added?**
Yes. `dxai cleanup` (or `dxai reset`) walks the manifest and removes only what dxai installed. It won't touch entries you added by hand.

---

## License

MIT
