---
title: Installation
description: How to install or run dxai, with or without a global install.
---

Three ways to run dxai. Pick the one that suits your workflow.

## 1. `npx` (no install)

```bash
npx dxai
```

`npx` downloads dxai on demand and runs it. Best for one-off setup or trying it out. No commitment to a global install.

## 2. Global install via npm

```bash
npm install -g dxai
dxai --version
```

Now `dxai` is on your `$PATH`. Use this if you'll run it often, or if you want shell completions later.

To uninstall:

```bash
npm uninstall -g dxai
```

## 3. From source (for contributors)

```bash
git clone https://github.com/nandha-kumar-hajari/dxai.git
cd dxai
npm install
node bin/cli.js --help

# optional: link the local checkout as a global command
npm link
dxai --version
```

When you're done:

```bash
npm unlink -g dxai
```

## System requirements

- **Node.js 18+** — verified in CI on Node 18, 20, 22.
- **npm** / **npx** — ships with Node.
- **Git** — recommended; needed for the skills-install fallback path.

dxai is verified on **macOS, Linux, and Windows** in the GitHub Actions matrix.

## What it touches on your machine

dxai writes to two scopes:

- **System** — your home dir: `~/.cursor/mcp.json`, `~/.codex/config.toml`, etc. See [Config files](/reference/config-files/) for the full per-tool list.
- **Project** — your current working directory: `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, etc.

Existing files are merged where possible (idempotent) and **always backed up** with a timestamped sibling (`<file>.bak.<timestamp>`) before any modification.
