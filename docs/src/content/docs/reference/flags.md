---
title: Flags
description: "Auto-generated flag reference across every dxai subcommand."
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: bin/cli.js (generator: scripts/docs/gen-flags.mjs)
-->

Auto-generated flag reference. Pulled from every subcommand registered in `bin/cli.js`.

## Top-level options

| Flag | Description |
| --- | --- |
| `-v, --version` | output the version number |

## Subcommand options

| Flag | Description | Available on | Default |
| --- | --- | --- | --- |
| `--agents <list>` | comma-separated agent IDs (cursor,claude-code,vscode,codex,gemini,windsurf,antigravity) | `both`, `project`, `save-profile`, `system` | — |
| `--dry-run` | preview changes without writing | `apply`, `both`, `project`, `system` | — |
| `--features <list>` | comma-separated project feature IDs | `both`, `project`, `save-profile`, `system` | — |
| `--here` | save as project-local ./.dxai/profile.json instead | `save-profile` | — |
| `--json` | emit machine-readable JSON output (no colors, no spinners) | `apply`, `both`, `doctor`, `list`, `profiles`, `project`, `save-profile`, `status`, `system`, `update` | — |
| `--mcp <list>` | comma-separated MCP server IDs | `both`, `project`, `save-profile`, `system` | — |
| `--mode <mode>` | mode to record: system \| project \| both | `save-profile` | — |
| `--no-profile` | skip auto-discovery of project/user profiles | `both`, `project`, `system` | — |
| `--path <path>` | save to an explicit file path | `save-profile` | — |
| `--profile <nameOrPath>` | load a saved profile (name or path) | `both`, `project`, `system` | — |
| `--skills <list>` | comma-separated skill IDs | `both`, `project`, `save-profile`, `system` | — |
| `--stack <list>` | comma-separated tech stack IDs | `both`, `project`, `save-profile`, `system` | — |
| `-y, --yes` | skip prompts; use defaults / values from flags | `both`, `project`, `system` | — |

## Environment variables

See [Environment Variables](/d3v-ai-cli/reference/env-vars/) for the full list.
