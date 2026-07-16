---
title: Manifest Schema
description: Fields written to ~/.dxai/manifest.json and ./.dxai/manifest.json. Schema version 1.
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: src/manifest.js (emptyManifest) — generator: scripts/docs/gen-manifest-schema.mjs
-->

Two manifest files capture what dxai installed:

- **System** — `~/.dxai/manifest.json` (path constant: `~/.dxai/manifest.json`)
- **Project** — `./.dxai/manifest.json` (relative to the project where you ran dxai)

Both files share the same shape and are written by the helpers in `src/manifest.js`. `dxai list`, `dxai status`, `dxai doctor`, and `dxai cleanup` all read these.

## Fields

| Key | Type | Description |
| --- | --- | --- |
| `version` | `number` | Manifest schema version. Used for forward-compatible migrations. Currently `1`. |
| `createdAt` | `string` (ISO 8601) | Timestamp the manifest was first created. Preserved across rewrites. |
| `updatedAt` | `string` (ISO 8601) | Timestamp of the most recent write. |
| `agents` | `string[]` | Agent IDs for which dxai has installed something. |
| `mcp` | `{ [agentId]: { [serverId]: { addedAt, configPath } } }` | Per-agent record of installed MCP servers. `addedAt` is ISO 8601; `configPath` points at the file dxai wrote into. |
| `skills` | `{ [skillId]: { addedAt, path } }` | Installed agent skills. `path` is the directory containing the skill on disk. |
| `tools` | — | — |
| `files` | `[{ relativePath, addedAt }]` | Project files dxai created (`AGENTS.md`, `.cursor/rules/*.mdc`, etc.). Used by `dxai status` to detect deletion. |

## Empty manifest

A fresh manifest (before any installs) has the shape:

```json
{
  "version": 1,
  "createdAt": null,
  "updatedAt": null,
  "agents": [],
  "mcp": {},
  "skills": {},
  "tools": {},
  "files": []
}
```

## Populated example

After `dxai system --agents cursor --mcp github,playwright`:

```json
{
  "version": 1,
  "createdAt": "2026-04-26T00:00:00.000Z",
  "updatedAt": "2026-04-26T00:00:00.000Z",
  "agents": [
    "cursor"
  ],
  "mcp": {
    "cursor": {
      "github": {
        "addedAt": "2026-04-26T00:00:00.000Z",
        "configPath": "/Users/you/.cursor/mcp.json"
      },
      "playwright": {
        "addedAt": "2026-04-26T00:00:00.000Z",
        "configPath": "/Users/you/.cursor/mcp.json"
      }
    }
  },
  "skills": {},
  "files": []
}
```
