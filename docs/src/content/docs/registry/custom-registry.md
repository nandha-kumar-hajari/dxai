---
title: Registry Sources
description: Where MCP server entries come from, how they stay current, and how to host your own catalog.
---

dxai's MCP catalog has two layers:

1. **The official MCP Registry** ([registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)) is the source of truth for *what a server looks like*: its hosted URL or package, required environment variables, deprecation status.
2. **The bundled catalog** (`src/registry/data/mcp-servers.json`) is the curated layer: *which* servers dxai recommends, how they are categorised, and the handful of servers that are not in the registry.

Most catalog entries link the two with a `registry` block and let the registry fill in the rest.

## Where entries come from

```jsonc
{
  "id": "context7",
  "name": "Context7",
  "description": "Live, version-specific library documentation",
  "category": "essential",
  "recommended": true,
  "registry": {
    "name": "io.github.upstash/context7",       // canonical registry name
    "prefer": { "transport": "remote" },          // optional, see below
    "resolved": { "version": "4.0.5", "at": "…", "fields": ["transport", "requiresEnv", …] }
  },
  "transport": { "type": "http", "url": "https://mcp.context7.com/mcp" }   // written by the resolver
}
```

The resolver only writes the fields listed in `registry.resolved.fields`. On its first run it claims every resolvable field the entry does not define (`transport`, `requiresEnv`, `requiresInput`, `version`, `stale`, `staleReason`). Anything else is curated by hand and never touched. To hand-curate an owned field, edit it and remove it from that list; to hand a field back, delete it.

`registry.prefer` steers the resolver when a record offers several options:

| Key | Effect |
|---|---|
| `transport: "remote" \| "package"` | Hosted remote first (default) or installable package first. `remote` also forces a remote that declares a required auth header. |
| `remote: "<url substring>"` | Pick one remote when the record lists many (Cloudflare lists one per product). |
| `pin: true` | Write the package version as a pin. Off by default — the policy is to pin minimally and let `npx` float. |

Records are mapped as follows: `streamable-http` remotes beat `sse`; `npm` packages run via `npx -y`, `pypi` via `uvx`; `oci`, `mcpb` and `nuget` packages are not supported yet. Only `https` remotes are accepted. Required environment variables become `requiresEnv`; required positional arguments become `requiresInput` placeholders. A record marked deprecated in the registry becomes `stale` with the registry's message.

Entries without a `registry` block (the reference servers, and vendors with no registry record yet) are written by hand exactly as before.

## How the catalog stays current

- **Weekly, maintainer-side.** The `catalog-health` workflow runs `scripts/registry-sync.mjs`, which re-resolves every linked entry and opens a pull request when something changed. The report lists what changed, what failed, and registry hits for the hand-written entries so migration candidates surface themselves. Run it locally with `node scripts/registry-sync.mjs --dry-run`.
- **On `dxai-cli update`, user-side.** After fetching the catalog snapshot, `dxai-cli update` re-resolves linked entries live and caches the result. Any failure keeps the snapshot values. Pass `--no-resolve` to skip the live stage. The background auto-refresh never resolves live; it only picks up the snapshot.

## Adding any registry server

You are not limited to the catalog. `dxai-cli add` accepts a registry name:

```bash
npx dxai-cli add io.github.upstash/context7 --agents cursor,claude-code
npx dxai-cli add io.github.microsoft/playwright-mcp --dry-run
```

The record is resolved live, validated, and written like a catalog entry under the last segment of its name (`playwright-mcp`). A name that a catalog entry already links to uses that entry. `dxai-cli remove` takes the same name. Because these servers are not in the catalog, their registry name and required env vars are recorded in the manifest so `doctor` and `status` still cover them.

Set `DXAI_MCP_REGISTRY_URL` to point both the live stage and `dxai-cli add` at a mirror.

## Runtime resolution

At runtime dxai resolves the catalog as **cache → bundled**:

1. **Local cache** at `~/.dxai/cache/<name>.json`, written by `dxai-cli update` and the periodic auto-refresh.
2. **Bundled snapshot** shipped with the npm package, always available offline.

`DXAI_REGISTRY_SOURCE=bundled` forces the bundled snapshot. The test runner, doc generators and catalog scripts set it so a developer's cache never stands in for the JSON in the repo.

## Hosting your own catalog

Set `DXAI_REGISTRY_URL` to a base URL that serves `mcp-servers.json`, `skills.json` and `automation-tools.json`:

```bash
DXAI_REGISTRY_URL=https://my-cdn.example.com/dxai-registry dxai update
```

The default base URL is the bundled JSON in this repo's `main` branch:

```
https://raw.githubusercontent.com/nandha-kumar-hajari/dxai/main/src/registry/data
```

Two ways to run one:

1. **Fork this repo and edit `src/registry/data/*.json`.** Your fork's raw GitHub URL becomes your registry, and the weekly sync workflow keeps your linked entries current too.
2. **Host the JSON files anywhere.** Any HTTPS URL serving the three files at the same base path works. Useful for company-internal MCP catalogs; entries may link to the public registry or be fully explicit.

Fetched catalogs are validated before they are cached: ids must be safe map keys, spawn commands must be allowlisted, `registry` blocks must be well-formed. A file that fails validation is rejected and the bundled snapshot stands.

## Schema

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
      "registry": { "name": "namespace/server", "prefer": { }, "resolved": { } },
      "transport": { "type": "http", "url": "https://…" },
      "requiresEnv": { "TOKEN_NAME": "Description" },
      "requiresInput": { "...": { "prompt": "...", "default": "...", "placeholder": "..." } },
      "configs": { "cursor": { }, "codex": { "toml": "…" }, "...": { } }
    }
  ]
}
```

`transport` is either `{ "type": "http", "url" }` or `{ "type": "stdio", "command", "args" }` and derives a config block for every agent. Explicit `configs.<agent>` blocks override derivation per agent for servers that do not fit the common shapes. `skills.json` and `automation-tools.json` have simpler entries; see the bundled files for the canonical shapes.

## Refreshing the cache

```bash
npx dxai-cli update                # fetch the snapshot, re-resolve live, cache, report the diff
npx dxai-cli update --no-resolve   # snapshot only
npx dxai-cli update --json         # machine-readable
```

The cache is read at every CLI startup; nothing else is required.
