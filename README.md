# d3v-ai-setup

```
  ██████╗  ██████╗ ██╗   ██╗
  ██╔══██╗ ╚════██╗██║   ██║
  ██║  ██║  █████╔╝██║   ██║
  ██║  ██║  ╚═══██╗╚██╗ ██╔╝
  ██████╔╝ ██████╔╝ ╚████╔╝
  ╚═════╝  ╚═════╝   ╚═══╝
  AI-Powered Dev Environment Setup
```

> **One command to bootstrap your entire AI development environment.**

`d3v-ai-setup` is an interactive CLI that configures **MCP servers**, **agent skills**, **Cursor rules and commands**, **project instruction files**, and **AI-friendly project scaffolding** across all major AI coding tools — simultaneously and in the correct format for each.

It works with **Cursor, Claude Code, VS Code / GitHub Copilot, OpenAI Codex CLI, Gemini CLI, Windsurf, and Google Antigravity**.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Usage](#usage)
- [System Setup](#system-setup-d3v-ai-setup-system)
- [Project Setup](#project-setup-d3v-ai-setup-project)
- [Supported Tools](#supported-tools)
- [MCP Servers](#mcp-servers)
- [Agent Skills](#agent-skills)
- [Tech Stacks & Cursor Rules](#tech-stacks--cursor-rules)
- [Cursor Commands](#cursor-commands)
- [Generated Project Files](#generated-project-files)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Local Development & Testing](#local-development--testing)
- [FAQ](#faq)

---

## Quick Start

```bash
npx d3v-ai-setup
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
npx d3v-ai-setup system     # global machine-level setup
npx d3v-ai-setup project    # project-level setup in current directory
npx d3v-ai-setup --help     # show usage
```

---

## Usage

```
d3v-ai-setup [command]

Commands:
  system    System-level setup (global IDE configs, MCP servers, skills)
  project   Project-level setup (stack, rules, CLAUDE.md, .editorconfig, etc.)

Options:
  --help    Show usage information

If no command is given, an interactive prompt lets you choose system, project, or both.
```

Both modes start with the same shared steps:

1. **Environment detection** — identifies your OS, Node.js, Git, Python, and which AI tools are installed
2. **Agent selection** — multi-select which AI tools you use (pre-checks any it detects)
3. **Missing tool installer** — for tools you selected but don't have, shows install commands for your platform

After that, each mode runs its own flow.

---

## System Setup (`d3v-ai-setup system`)

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
| VS Code / Copilot | JSON (`servers`) | `.vscode/mcp.json` |
| OpenAI Codex CLI | TOML (`mcp_servers`) | `~/.codex/config.toml` |
| Gemini CLI | JSON (`mcpServers`) | `~/.gemini/settings.json` |
| Windsurf | JSON (`mcpServers`) | `~/.codeium/windsurf/mcp_config.json` |
| Google Antigravity | JSON (`mcpServers`) | `~/.gemini/antigravity/mcp_config.json` |

Each tool uses a different config format and key name. `d3v-ai-setup` translates a single server selection into the correct format for every tool you selected.

---

## Project Setup (`d3v-ai-setup project`)

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

`d3v-ai-setup` auto-detects these tools and pre-selects any that are installed:

| Tool | Detection | Description |
|------|-----------|-------------|
| **Cursor** | `cursor` command | AI-first IDE (VS Code fork). Supports global + project MCP, rules, commands, `.cursorignore` |
| **Claude Code** | `claude` command | Anthropic's terminal AI agent. MCP configured via `claude mcp add` CLI |
| **VS Code / Copilot** | `code` command | VS Code with GitHub Copilot agent mode. Supports project-level MCP |
| **OpenAI Codex CLI** | `codex` command | OpenAI's terminal coding agent. MCP configured via TOML |
| **Gemini CLI** | `gemini` command | Google's terminal AI agent. Supports global + project MCP |
| **Windsurf** | `windsurf` command | Codeium's AI IDE. Global MCP via JSON |
| **Google Antigravity** | `agy` command | Google's agent-first AI IDE. Global MCP via JSON |

If a selected tool is not installed, `d3v-ai-setup` shows platform-specific install commands:

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

When you select tech stacks during project setup, `d3v-ai-setup` generates stack-specific `.mdc` rule files in `.cursor/rules/`. These files teach Cursor's AI the conventions, patterns, and best practices for your stack.

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

All config writes are **merge-based and idempotent**. If a config file already exists, `d3v-ai-setup`:

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

## Local Development & Testing

To test the CLI locally before publishing:

### 1. Install dependencies

```bash
cd d3v-ai-cli
npm install
```

### 2. Run directly with Node

```bash
node bin/cli.js              # interactive mode
node bin/cli.js system       # system setup only
node bin/cli.js project      # project setup only
node bin/cli.js --help       # show usage
```

### 3. Link globally (simulates `npx d3v-ai-setup`)

```bash
npm link
```

This creates a global symlink so you can run `d3v-ai-setup` from any directory, just like an end user would:

```bash
cd ~/some-real-project
d3v-ai-setup                 # interactive
d3v-ai-setup system          # global configs only
d3v-ai-setup project         # project configs only
```

### 4. Unlink when done

```bash
npm unlink -g d3v-ai-setup
```

### Project structure

```
bin/
  cli.js                    # CLI entry point (shebang, arg parsing)
src/
  index.js                  # Main logic (prompts, orchestration)
  branding.js               # Banner, colors, message helpers
  config-writer.js          # File writers (JSON/TOML merge, backups)
  detect.js                 # OS, prerequisite, and agent detection
  registry/
    mcp-servers.js           # MCP server definitions + per-agent configs
    skills.js                # Agent skills registry
    stacks.js                # Tech stacks, Cursor rules, commands, templates
```

### Tips

- **Safe to re-run** — config writes are idempotent (merge-based, never overwrites existing entries)
- **Project mode uses `cwd`** — run it from inside the project you want to configure
- **System mode writes to `~`** — touches global config files like `~/.cursor/mcp.json`
- **Backups** — any existing config file is backed up with a timestamp before modification (e.g., `mcp.json.bak.2025-01-15T10-30-00`)

---

## FAQ

**Can I run it multiple times?**
Yes. It's idempotent. Existing configs are merged, not overwritten. Existing project files are skipped.

**Does it modify my existing MCP configs?**
It adds new server entries but never changes or removes existing ones. A backup is created before any modification.

**What if I don't have all the AI tools installed?**
Select the ones you plan to use. The tool will generate configs for them and show install commands for anything not yet on your machine. You can continue setup without having them installed.

**Where do skills get installed?**
Into `.cursor/skills/` if Cursor is selected, otherwise `.agents/skills/` in the project directory.

**Can I use system and project setup separately?**
Yes. Run `npx d3v-ai-setup system` for just global configs, or `npx d3v-ai-setup project` for just the current project. They're fully independent flows that share the same agent detection and selection step.

**What config formats does it handle?**
JSON (Cursor, VS Code, Gemini, Windsurf, Antigravity), TOML (Codex CLI), and CLI commands (Claude Code). The translation is automatic.

---

## License

MIT
