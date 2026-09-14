---
title: "dxai-cli both"
description: Run system + project setup in one go
sidebar: {"order":3}
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: bin/cli.js (generator: scripts/docs/gen-commands.mjs)
-->

Run system + project setup in one go

## Synopsis

```bash
npx dxai-cli both [options]
```

## Options

| Flag | Description | Notes |
| --- | --- | --- |
| `-y, --yes` | skip prompts; use defaults / values from flags | — |
| `--agents <list>` | comma-separated agent IDs (cursor,claude-code,vscode,vscode-insiders,codex,gemini,antigravity,antigravity-ide,antigravity-cli,devin-desktop,devin-cli; former ids like windsurf still work) | required |
| `--mcp <list>` | comma-separated MCP server IDs | required |
| `--skills <list>` | comma-separated skill IDs | required |
| `--tools <list>` | comma-separated automation tool IDs (agent-browser,agent-device) | required |
| `--features <list>` | comma-separated project feature IDs | required |
| `--stack <list>` | comma-separated tech stack IDs | required |
| `--profile <nameOrPath>` | load a saved profile (name or path) | required |
| `--no-profile` | skip auto-discovery of project/user profiles | — |
| `--json` | emit machine-readable JSON output (no colors, no spinners) | — |
| `--dry-run` | preview changes without writing | — |
| `--no-update` | skip the periodic catalog refresh check | — |
