---
title: MCP Servers
description: "17 MCP servers across 8 categories, 11 resolved from the official MCP Registry. Auto-generated from src/registry/data/mcp-servers.json."
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: src/registry/data/mcp-servers.json (generator: scripts/docs/gen-mcp-servers.mjs)
-->

The bundled catalog of MCP servers. Each row shows which agents support the server and any environment variables you need to set.

Pick servers in the wizard, or pass `--mcp <id1>,<id2>` to a setup command. ★ marks recommended (pre-checked) entries.

The **Source** column names the record in the [official MCP Registry](https://registry.modelcontextprotocol.io) an entry is resolved from; `bundled` entries are written by hand. See [Registry Sources](/registry/custom-registry/).

## 🔧 Essential

Core tools every developer should have

| ID | Name | Description | Agents | Required env | Required input | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `context7` | ★ Context7 | Live, version-specific library documentation | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `io.github.upstash/context7` |
| `sequential-thinking` | ★ Sequential Thinking | Multi-step structured reasoning for complex problems | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | bundled |

## 💻 Code & Git

Source control and code intelligence

| ID | Name | Description | Agents | Required env | Required input | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `github` | ★ GitHub | PRs, issues, repos, code search (official remote MCP, OAuth) | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `io.github.github/github-mcp-server` |
| `gitlab` | GitLab | Merge requests, issues, pipelines (official remote MCP) | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `com.gitlab/mcp` |
| `claude-code-mcp` | Claude Code as MCP | Use Claude Code as a sub-agent inside other editors | `cursor`, `vscode`, `vscode-insiders`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | bundled |

## 🎨 Design

Design-to-code workflows

| ID | Name | Description | Agents | Required env | Required input | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `figma` | Figma | Design-to-code from Figma components | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `com.figma.mcp/mcp` |

## 📋 Productivity

Project management and communication

| ID | Name | Description | Agents | Required env | Required input | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `notion` | Notion | Read/write Notion pages and databases | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `com.notion/mcp` |
| `slack` | Slack | Search messages, channels, send notifications | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | `SLACK_BOT_TOKEN` | — | bundled |
| `linear` | Linear | Issues, projects, cycles management (official remote MCP, OAuth) | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `app.linear/linear` |

## 🗄️  Database

Database access and management

| ID | Name | Description | Agents | Required env | Required input | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `supabase` | Supabase | Supabase database, auth, storage (official remote MCP) | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `com.supabase/mcp` |
| `neon` | Neon Postgres | Serverless Postgres database | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | `NEON_API_KEY` | — | bundled |

## 🌐 Browser & Testing

Browser automation and testing

| ID | Name | Description | Agents | Required env | Required input | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `playwright` | ★ Playwright | Browser automation, E2E testing, screenshots | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `io.github.microsoft/playwright-mcp` |
| `browserbase` | Browserbase | Cloud browser sessions for testing | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `GEMINI_API_KEY` | — | `io.github.browserbase/mcp-server-browserbase` |

## ☁️  Cloud & Deploy

Deployment and infrastructure

| ID | Name | Description | Agents | Required env | Required input | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `vercel` | Vercel | Deploy, manage projects, domains (official remote MCP) | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `com.vercel/vercel-mcp` |
| `cloudflare` | Cloudflare | Workers bindings: KV, D1, R2, Durable Objects (official remote MCP) | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | `com.cloudflare.mcp/mcp` |

## ⚡ Advanced

Agent orchestration and specialized tools

| ID | Name | Description | Agents | Required env | Required input | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `filesystem` | Filesystem | Secure file access outside project root | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | `allowedPath` | bundled |
| `memory` | Memory | Persistent memory across agent sessions | `cursor`, `claude-code`, `vscode`, `vscode-insiders`, `codex`, `gemini`, `antigravity`, `antigravity-ide`, `antigravity-cli`, `devin-desktop`, `devin-cli` | — | — | bundled |

## Want one that's missing?

Four options:

1. Add it straight from the official MCP Registry by name: `dxai-cli add io.github.owner/server`. No catalog change needed.
2. Open a PR adding it to [`src/registry/data/mcp-servers.json`](https://github.com/nandha-kumar-hajari/dxai/main/src/registry/data/mcp-servers.json) — a `registry` block is enough, the weekly sync fills in the rest.
3. Host your own catalog and point [`DXAI_REGISTRY_URL`](/registry/custom-registry/) at it.
4. Add the entry directly to your tool's config; dxai will leave hand-added entries alone.
