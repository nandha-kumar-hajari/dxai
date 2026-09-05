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
| `--agents <list>` | comma-separated agent IDs (cursor,claude-code,vscode,codex,gemini,windsurf,antigravity-ide,antigravity-cli) | `add`, `both`, `project`, `remove`, `save-profile`, `system` | — |
| `--backups` | with --yes/--json: also delete .bak.<ts> backup files | `cleanup` | — |
| `--dry-run` | preview changes without writing | `add`, `apply`, `both`, `cleanup`, `project`, `remove`, `rollback`, `system` | — |
| `--features <list>` | comma-separated project feature IDs | `both`, `project`, `save-profile`, `system` | — |
| `--handshake` | spawn each installed MCP server and verify it speaks JSON-RPC over stdio | `doctor` | — |
| `--here` | save as project-local ./.dxai/profile.json instead | `save-profile` | — |
| `--json` | emit machine-readable JSON output (no colors, no spinners) | `add`, `apply`, `both`, `cleanup`, `doctor`, `list`, `profiles`, `project`, `remove`, `rollback`, `save-profile`, `status`, `system`, `update` | — |
| `--list` | list restorable backups without changing anything | `rollback` | — |
| `--mcp <list>` | comma-separated MCP server IDs | `both`, `project`, `save-profile`, `system` | — |
| `--mode <mode>` | mode to record: system \| project \| both | `save-profile` | — |
| `--no-profile` | skip auto-discovery of project/user profiles | `both`, `project`, `system` | — |
| `--no-resolve` | skip re-resolving registry-linked MCP servers live from the official MCP Registry | `update` | — |
| `--no-update` | skip the periodic catalog refresh check | `both`, `project`, `system` | — |
| `--path <path>` | save to an explicit file path | `save-profile` | — |
| `--profile <nameOrPath>` | load a saved profile (name or path) | `both`, `project`, `system` | — |
| `--project` | write to project-level config instead of global | `add`, `remove` | — |
| `--registry-url <url>` | registry base URL (overrides DXAI_REGISTRY_URL) | `update` | — |
| `--registry-version <ref>` | registry tag/branch to fetch (default: main) | `update` | — |
| `--skills <list>` | comma-separated skill IDs | `both`, `project`, `save-profile`, `system` | — |
| `--stack <list>` | comma-separated tech stack IDs | `both`, `project`, `save-profile`, `system` | — |
| `--tools <list>` | comma-separated automation tool IDs (agent-browser,agent-device) | `both`, `project`, `system` | — |
| `-y, --yes` | skip prompts; use defaults / values from flags | `add`, `both`, `cleanup`, `project`, `rollback`, `system` | — |

## Environment variables

See [Environment Variables](/reference/env-vars/) for the full list.
