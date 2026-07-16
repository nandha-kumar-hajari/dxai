---
title: dxai add
description: "Add MCP server(s) to detected agents (fast path, no wizard)"
sidebar: {"order":5}
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: bin/cli.js (generator: scripts/docs/gen-commands.mjs)
-->

Add MCP server(s) to detected agents (fast path, no wizard)

## Synopsis

```bash
dxai add [options] <mcp...>
```

## Arguments

| Argument | Description |
| --- | --- |
| `<mcp>` | — |

## Options

| Flag | Description | Notes |
| --- | --- | --- |
| `--agents <list>` | comma-separated agent IDs to target (default: detected) | required |
| `--project` | write to project-level config instead of global | — |
| `-y, --yes` | non-interactive; use defaults for any required inputs | — |
| `--json` | emit machine-readable JSON output | — |
| `--dry-run` | preview what would be added without writing | — |
