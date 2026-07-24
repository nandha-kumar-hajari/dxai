---
title: dxai cleanup
description: "Remove dxai-managed configs, files, and skills (scope: system | project | both)"
sidebar: {"order":4}
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: bin/cli.js (generator: scripts/docs/gen-commands.mjs)
-->

Remove dxai-managed configs, files, and skills (scope: system | project | both)

## Synopsis

```bash
dxai cleanup [options] [scope]
```

## Aliases

`dxai reset`

## Arguments

| Argument | Description |
| --- | --- |
| `[scope]` | — |

## Options

| Flag | Description | Notes |
| --- | --- | --- |
| `-y, --yes` | non-interactive; remove everything dxai-managed (custom-edit-prone files and backups are kept) | — |
| `--backups` | with --yes/--json: also delete .bak.<ts> backup files | — |
| `--json` | emit machine-readable JSON output (implies non-interactive) | — |
| `--dry-run` | preview what would be removed without deleting anything | — |
