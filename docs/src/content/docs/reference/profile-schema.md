---
title: Profile Schema
description: Fields a dxai profile JSON file may contain. 7 keys.
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: src/profile.js (PROFILE_KEYS) — generator: scripts/docs/gen-profile-schema.mjs
-->

A profile is a JSON file capturing what `dxai-cli system` / `dxai-cli project` should install. CLI flags always beat profile values.

Auto-discovery: `./.dxai/profile.json` → `~/.dxai/config.json` → `~/.dxairc`. Override with `--profile <nameOrPath>`. See [Guide / Profiles](/guide/profiles/) for usage.

## Fields

| Key | Type | Description |
| --- | --- | --- |
| `mode` | `"system"` \| `"project"` \| `"both"` | Default mode `dxai-cli apply` runs when this profile is active. |
| `agents` | `string[]` | Agent IDs to configure — see [Supported Agents](/reference/agents/) for the list; former ids (e.g. windsurf) are accepted. |
| `mcp` | `string[]` | MCP server IDs to install. See [Registry / MCP servers](/registry/mcp-servers/). |
| `skills` | `string[]` | Skill IDs to install. See [Registry / Skills](/registry/skills/). |
| `features` | `string[]` | Project features to generate (cursor-rules, agents-md, editorconfig, etc.). |
| `stack` | `string[]` | Tech stack IDs. See [Registry / Stacks](/registry/stacks/). |
| `mcpInputs` | `object` | Per-server input values, keyed by server ID. Example: `{"filesystem": {"allowedPath": "~"}}`. |

## Example

```json
{
  "mode": "both",
  "agents": [
    "cursor",
    "claude-code"
  ],
  "mcp": [
    "github",
    "playwright",
    "context7"
  ],
  "skills": [
    "frontend-design"
  ],
  "features": [
    "cursor-rules",
    "agents-md",
    "editorconfig"
  ],
  "stack": [
    "react",
    "node"
  ],
  "mcpInputs": {
    "filesystem": {
      "allowedPath": "~/Code"
    }
  }
}
```

## Forward compatibility

Unknown keys are silently dropped when the profile is read. New keys can be added in future dxai releases without breaking existing profiles.
