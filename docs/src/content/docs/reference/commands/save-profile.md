---
title: "dxai-cli save-profile"
description: "Save selections as a profile. Defaults to ~/.dxai/profiles/<name>.json"
sidebar: {"order":9}
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: bin/cli.js (generator: scripts/docs/gen-commands.mjs)
-->

Save selections as a profile. Defaults to ~/.dxai/profiles/<name>.json

## Synopsis

```bash
npx dxai-cli save-profile [options] [name]
```

## Arguments

| Argument | Description |
| --- | --- |
| `[name]` | — |

## Options

| Flag | Description | Notes |
| --- | --- | --- |
| `--mode <mode>` | mode to record: system \| project \| both | required |
| `--agents <list>` | comma-separated agent IDs | required |
| `--mcp <list>` | comma-separated MCP server IDs | required |
| `--skills <list>` | comma-separated skill IDs | required |
| `--features <list>` | comma-separated feature IDs | required |
| `--stack <list>` | comma-separated stack IDs | required |
| `--here` | save as project-local ./.dxai/profile.json instead | — |
| `--path <path>` | save to an explicit file path | required |
| `--json` | emit machine-readable JSON output | — |
