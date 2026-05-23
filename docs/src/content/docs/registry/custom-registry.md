---
title: Custom Registry
description: Host your own MCP server / skill catalog or fork the bundled one.
---

The dxai registry (MCP servers, skills) is plain JSON shipped alongside the CLI:

```
src/registry/data/
├── mcp-servers.json
└── skills.json
```

At runtime dxai resolves the registry as **cache → bundled**:

1. **Local cache** at `~/.dxai/cache/<name>.json` (written by `dxai update`)
2. **Bundled snapshot** shipped with the npm package (always available, even offline)

## Pointing at a fork or private mirror

Set `DXAI_REGISTRY_URL` to a base URL that hosts `mcp-servers.json` and `skills.json`:

```bash
DXAI_REGISTRY_URL=https://my-cdn.example.com/dxai-registry dxai update
```

The default base URL is the bundled JSON in this repo's `main` branch:

```
https://raw.githubusercontent.com/nandha-kumar-hajari/dxai/main/src/registry/data
```

## Hosting your own

Two options:

1. **Fork this repo and edit `src/registry/data/*.json`** — your fork's raw GitHub URL becomes your registry. The bundled JSON ships with each release as the offline fallback.
2. **Host the JSON files anywhere** — any HTTPS URL serving `mcp-servers.json` and `skills.json` at the same base path works. Useful for company-internal MCP catalogs.

## Schema

Each file has the shape:

```json
{
  "categories": [{ "id": "...", "label": "...", "description": "..." }],
  "servers": [
    {
      "id": "...",
      "name": "...",
      "description": "...",
      "category": "...",
      "recommended": true,
      "requiresEnv": { "TOKEN_NAME": "Description" },
      "requiresInput": { "...": { "prompt": "...", "default": "...", "placeholder": "..." } },
      "configs": {
        "cursor":      { /* Cursor JSON config */ },
        "claude-code": { /* Claude Code CLI config */ },
        "codex":       { "toml": "[mcp_servers.id]\\n…" },
        "gemini":      { /* Gemini JSON config */ },
        "vscode":      { /* VS Code JSON config */ },
        "windsurf":    { /* Windsurf JSON config */ },
        "antigravity": { /* Antigravity JSON config */ }
      }
    }
  ]
}
```

`skills.json` has `categories` and `skills` arrays with simpler entries — see the bundled file for the canonical shape.

## Refreshing the cache

```bash
dxai update              # fetch latest registry, write cache, report diff
dxai update --json       # machine-readable
```

The cache is read at every CLI startup; nothing else is required.
