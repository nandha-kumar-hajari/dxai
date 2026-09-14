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
| `dxai-cli system` | System-level setup (global IDE configs, MCP servers, skills) |
| `dxai-cli project` | Project-level setup (stack, rules, CLAUDE.md, .editorconfig, etc.) (alias: `init`) |
| `dxai-cli both` | Run system + project setup in one go |
| `dxai-cli cleanup` | Remove dxai-managed configs, files, and skills (scope: system \| project \| both) (alias: `reset`) |
| `dxai-cli add` | Add MCP server(s) to detected agents (fast path, no wizard). Takes catalogue ids or official MCP Registry names like io.github.owner/server |
| `dxai-cli remove` | Remove MCP server(s) from detected agents (fast path, no wizard) (alias: `rm`) |
| `dxai-cli rollback` | Restore dxai-managed files from their most recent .bak.<ts> backup |
| `dxai-cli apply` | Run setup using a saved profile (auto-loads ./.dxai/profile.json if no name given) |
| `dxai-cli save-profile` | Save selections as a profile. Defaults to ~/.dxai/profiles/<name>.json |
| `dxai-cli profiles` | List discoverable profiles (~/.dxai/profiles + ./.dxai) |
| `dxai-cli list` | Show dxai-managed installs from the manifest (system + project) |
| `dxai-cli status` | Compare manifest with live config files; surface drift |
| `dxai-cli doctor` | Validate dxai installation: configs parse, env vars set, tools on PATH |
| `dxai-cli update` | Fetch the latest registry (MCP servers, skills) and cache it locally |
