---
title: "dxai-cli rollback"
description: "Restore dxai-managed files from their most recent .bak.<ts> backup"
sidebar: {"order":7}
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: bin/cli.js (generator: scripts/docs/gen-commands.mjs)
-->

Restore dxai-managed files from their most recent .bak.<ts> backup

## Synopsis

```bash
npx dxai-cli rollback [options]
```

## Options

| Flag | Description | Notes |
| --- | --- | --- |
| `--list` | list restorable backups without changing anything | — |
| `-y, --yes` | restore the latest backup for every file without prompting | — |
| `--json` | emit machine-readable JSON output | — |
| `--dry-run` | preview what would be restored without writing | — |
