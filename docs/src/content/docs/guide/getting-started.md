---
title: Getting Started
description: What dxai is, what it configures, and the shortest path to a working setup.
---

`dxai` is an interactive CLI that configures **MCP servers**, **agent skills**, **Cursor rules and commands**, **project instruction files** (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`), and **AI-friendly project scaffolding** across all major AI coding tools — simultaneously and in the correct format for each.

It works with **Cursor, Claude Code, VS Code / Copilot, OpenAI Codex, Gemini CLI, Google Antigravity, and Devin Desktop (formerly Windsurf)** — see [Supported Agents](/reference/agents/) for exactly what is detected and where each config is written.

## What you get

Two independent flows that you can run separately or together:

- **System mode** — global, machine-level config files (`~/.cursor/mcp.json`, `~/.codex/config.toml`, …). Adds the MCP servers and agent skills you select to every selected tool, in the right format for each.
- **Project mode** — repo-local AI-friendly scaffolding: `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.cursorignore`, `.editorconfig`, `.gitattributes`, stack-specific Cursor rules, and project-level MCP configs that you can commit.

Run with no arguments for an interactive menu, or call `dxai-cli system` / `dxai-cli project` / `dxai-cli both` directly.

## Run it now

```bash
npx dxai-cli
```

You'll be prompted to choose what to set up:

```
? What would you like to set up?
❯ System  — global IDE configs, MCP servers, agent skills
  Project — AI-friendly project config (rules, CLAUDE.md, etc.)
  Both    — full system + project setup
```

That's it for interactive mode. Continue to [Quick Start](/guide/quick-start/) for an end-to-end walkthrough, or jump to [Non-interactive / CI](/guide/non-interactive/) if you want to script it.

## Where things live

| Where | What |
|---|---|
| `~/.dxai/profiles/<name>.json` | Saved user profiles |
| `~/.dxai/manifest.json` | Record of system-level installs (read by `list` / `status` / `doctor`) |
| `~/.dxai/cache/` | Cached registry from `dxai-cli update` |
| `./.dxai/profile.json` | Project-local profile (commit this for your team) |
| `./.dxai/manifest.json` | Record of project-level installs |

Nothing in `~/.dxai/` is required to run dxai — they're all written by it as you go.

## Requirements

- **Node.js 18+** (required)
- **npm** or **npx** (comes with Node.js)
- **Git** (recommended; needed for skills installation fallback and changelog tooling)
