---
title: dxai remove
description: "Remove MCP server(s) from detected agents (fast path, no wizard)"
sidebar: {"order":6}
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: bin/cli.js (generator: scripts/docs/gen-commands.mjs)
-->

Remove MCP server(s) from detected agents (fast path, no wizard)

## Synopsis

```bash
dxai remove [options] <mcp...>
```

## Aliases

`dxai rm`

## Arguments

| Argument | Description |
| --- | --- |
| `<mcp>` | — |

## Options

| Flag | Description | Notes |
| --- | --- | --- |
| `--agents <list>` | comma-separated agent IDs to target (default: detected) | required |
| `--project` | remove from project-level config instead of global | — |
| `--json` | emit machine-readable JSON output | — |
| `--dry-run` | preview what would be removed without writing | — |
