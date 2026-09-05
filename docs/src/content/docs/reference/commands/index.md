---
title: Commands
description: "Auto-generated reference for every dxai subcommand."
sidebar: {"order":0}
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: bin/cli.js (generator: scripts/docs/gen-commands.mjs)
-->

Every dxai subcommand. Each command page includes its full options table and synopsis.

| Command | What it does |
| --- | --- |
| `dxai system` | System-level setup (global IDE configs, MCP servers, skills) |
| `dxai project` | Project-level setup (stack, rules, CLAUDE.md, .editorconfig, etc.) (alias: `init`) |
| `dxai both` | Run system + project setup in one go |
| `dxai cleanup` | Remove dxai-managed configs, files, and skills (scope: system \| project \| both) (alias: `reset`) |
| `dxai add` | Add MCP server(s) to detected agents (fast path, no wizard). Takes catalogue ids or official MCP Registry names like io.github.owner/server |
| `dxai remove` | Remove MCP server(s) from detected agents (fast path, no wizard) (alias: `rm`) |
| `dxai rollback` | Restore dxai-managed files from their most recent .bak.<ts> backup |
| `dxai apply` | Run setup using a saved profile (auto-loads ./.dxai/profile.json if no name given) |
| `dxai save-profile` | Save selections as a profile. Defaults to ~/.dxai/profiles/<name>.json |
| `dxai profiles` | List discoverable profiles (~/.dxai/profiles + ./.dxai) |
| `dxai list` | Show dxai-managed installs from the manifest (system + project) |
| `dxai status` | Compare manifest with live config files; surface drift |
| `dxai doctor` | Validate dxai installation: configs parse, env vars set, tools on PATH |
| `dxai update` | Fetch the latest registry (MCP servers, skills) and cache it locally |
