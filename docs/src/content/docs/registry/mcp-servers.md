---
title: MCP Servers
description: "17 MCP servers across 8 categories. Auto-generated from src/registry/data/mcp-servers.json."
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: src/registry/data/mcp-servers.json (generator: scripts/docs/gen-mcp-servers.mjs)
-->

The bundled catalog of MCP servers. Each row shows which agents support the server and any environment variables you need to set.

Pick servers in the wizard, or pass `--mcp <id1>,<id2>` to a setup command. ★ marks recommended (pre-checked) entries.

## 🔧 Essential

Core tools every developer should have

| ID | Name | Description | Agents | Required env | Required input |
| --- | --- | --- | --- | --- | --- |
| `context7` | ★ Context7 | Live, version-specific library documentation | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | — | — |
| `sequential-thinking` | ★ Sequential Thinking | Multi-step structured reasoning for complex problems | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | — | — |

## 💻 Code & Git

Source control and code intelligence

| ID | Name | Description | Agents | Required env | Required input |
| --- | --- | --- | --- | --- | --- |
| `github` | ★ GitHub | PRs, issues, repos, code search | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | `GITHUB_PERSONAL_ACCESS_TOKEN` | — |
| `gitlab` | GitLab | Merge requests, issues, pipelines | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | `GITLAB_TOKEN` | — |
| `claude-code-mcp` | Claude Code as MCP | Use Claude Code as a sub-agent inside other editors | `cursor`, `vscode`, `gemini`, `windsurf`, `antigravity` | — | — |

## 🎨 Design

Design-to-code workflows

| ID | Name | Description | Agents | Required env | Required input |
| --- | --- | --- | --- | --- | --- |
| `figma` | Figma | Design-to-code from Figma components | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | — | — |

## 📋 Productivity

Project management and communication

| ID | Name | Description | Agents | Required env | Required input |
| --- | --- | --- | --- | --- | --- |
| `notion` | Notion | Read/write Notion pages and databases | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | — | — |
| `slack` | Slack | Search messages, channels, send notifications | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | `SLACK_BOT_TOKEN` | — |
| `linear` | Linear | Issues, projects, cycles management | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | `LINEAR_API_KEY` | — |

## 🗄️  Database

Database access and management

| ID | Name | Description | Agents | Required env | Required input |
| --- | --- | --- | --- | --- | --- |
| `supabase` | Supabase | Supabase database, auth, storage | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | `SUPABASE_ACCESS_TOKEN` | — |
| `neon` | Neon Postgres | Serverless Postgres database | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | `NEON_API_KEY` | — |

## 🌐 Browser & Testing

Browser automation and testing

| ID | Name | Description | Agents | Required env | Required input |
| --- | --- | --- | --- | --- | --- |
| `playwright` | ★ Playwright | Browser automation, E2E testing, screenshots | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | — | — |
| `browserbase` | Browserbase | Cloud browser sessions for testing | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | `BROWSERBASE_API_KEY` | — |

## ☁️  Cloud & Deploy

Deployment and infrastructure

| ID | Name | Description | Agents | Required env | Required input |
| --- | --- | --- | --- | --- | --- |
| `vercel` | Vercel | Deploy, manage projects, domains | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | `VERCEL_TOKEN` | — |
| `cloudflare` | Cloudflare | Workers, Pages, DNS, R2 storage | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | — | — |

## ⚡ Advanced

Agent orchestration and specialized tools

| ID | Name | Description | Agents | Required env | Required input |
| --- | --- | --- | --- | --- | --- |
| `filesystem` | Filesystem | Secure file access outside project root | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | — | `allowedPath` |
| `memory` | Memory | Persistent memory across agent sessions | `cursor`, `claude-code`, `vscode`, `codex`, `gemini`, `windsurf`, `antigravity` | — | — |

## Want one that's missing?

Three options:

1. Open a PR adding it to [`src/registry/data/mcp-servers.json`](https://github.com/nandha-kumar-hajari/dxai/main/src/registry/data/mcp-servers.json).
2. Host your own catalog and point [`DXAI_REGISTRY_URL`](/dxai/registry/custom-registry/) at it.
3. Add the entry directly to your tool's config; dxai will leave hand-added entries alone.
