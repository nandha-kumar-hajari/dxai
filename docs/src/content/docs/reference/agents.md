---
title: Supported Agents
description: "11 tools dxai detects and configures. Auto-generated from src/detect.js."
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: src/detect.js (generator: scripts/docs/gen-agents.mjs)
-->

Every tool dxai can detect and configure, generated from `AGENT_DEFINITIONS` in `src/detect.js` — the single source of truth the CLI, tests and health checks all read.

Each definition is verified against the vendor's current documentation and stamped with the date. The weekly agent-health workflow flags entries past their review window, install channels that disappeared, and docs that moved.

## Detection

An agent counts as installed when any signal hits: a command on `PATH`, a macOS app bundle, or a documented install path that is often missing from `PATH`. The state directory is reported separately.

| ID | Name | Commands | macOS app | Install paths | State dir |
| --- | --- | --- | --- | --- | --- |
| `cursor` | Cursor | `cursor` | `Cursor.app` | — | `~/.cursor` |
| `claude-code` | Claude Code | `claude` | `Claude.app` | `~/.local/bin/claude` | `~/.claude` |
| `vscode` | VS Code / GitHub Copilot | `code` | `Visual Studio Code.app` | — | `~/Library/Application Support/Code/User` |
| `vscode-insiders` | VS Code Insiders | `code-insiders` | `Visual Studio Code - Insiders.app` | — | `~/Library/Application Support/Code - Insiders/User` |
| `codex` | OpenAI Codex | `codex` | `ChatGPT.app` | — | `~/.codex` |
| `gemini` | Gemini CLI | `gemini` | — | — | `~/.gemini` |
| `antigravity` | Antigravity | — | `Antigravity.app` | — | `~/.gemini/antigravity` |
| `antigravity-ide` | Antigravity IDE | `agy-ide`, `antigravity-ide` | `Antigravity IDE.app` | `~/.antigravity-ide/antigravity-ide/bin/agy-ide` | `~/.gemini/antigravity-ide` |
| `antigravity-cli` | Antigravity CLI | `agy` | — | `~/.local/bin/agy`, `~/AppData/Local/agy/bin/agy.exe` | `~/.gemini/antigravity-cli` |
| `devin-desktop` | Devin Desktop | `devin-desktop`, `windsurf` | `Devin.app`, `Windsurf.app` | — | `~/.config/devin` |
| `devin-cli` | Devin CLI | `devin` | — | — | `~/.devin` |

## MCP configuration

Where dxai writes MCP servers for each agent, and the dialect it writes them in. Paths are shown for macOS/Linux; Windows equivalents follow each tool's convention (`%APPDATA%`, `%LOCALAPPDATA%`).

| ID | Global file | Project file | Key | Dialect |
| --- | --- | --- | --- | --- |
| `cursor` | `~/.cursor/mcp.json` | `./.cursor/mcp.json` | `mcpServers` | JSON, remote key `url`, env `${env:VAR}` · `type` on stdio |
| `claude-code` | `~/.claude.json` (via CLI) | `./.mcp.json` | `mcpServers` | `claude mcp add --scope user …`; project: JSON, remote key `url`, env `${VAR}` · `type` on http/stdio |
| `vscode` | `~/Library/Application Support/Code/User/mcp.json` | `./.vscode/mcp.json` | `servers` | JSON, remote key `url`, env `${env:VAR}` · `type` on http/stdio |
| `vscode-insiders` | `~/Library/Application Support/Code - Insiders/User/mcp.json` | `./.vscode/mcp.json` | `servers` | JSON, remote key `url`, env `${env:VAR}` · `type` on http/stdio |
| `codex` | `~/.codex/config.toml` | `./.codex/config.toml` | `mcp_servers` | TOML `[mcp_servers.<id>]`, env forwarded via `env_vars` |
| `gemini` | `~/.gemini/settings.json` | `./.gemini/settings.json` | `mcpServers` | JSON, remote key `httpUrl`, env `${VAR}` |
| `antigravity` | `~/.gemini/config/mcp_config.json` | — | `mcpServers` | JSON, remote key `serverUrl`, env value substituted at write time |
| `antigravity-ide` | `~/.gemini/config/mcp_config.json` | `./.agents/mcp_config.json` | `mcpServers` | JSON, remote key `serverUrl`, env value substituted at write time |
| `antigravity-cli` | `~/.gemini/config/mcp_config.json` | `./.agents/mcp_config.json` | `mcpServers` | JSON, remote key `serverUrl`, env value substituted at write time |
| `devin-desktop` | `~/.config/devin/mcp_config.json` | `./.devin/mcp_config.json` | `mcpServers` | JSON, remote key `url`, env `${env:VAR}` |
| `devin-cli` | `~/.config/devin/mcp_config.json` | `./.devin/mcp_config.json` | `mcpServers` | JSON, remote key `url`, env `${env:VAR}` |

## Install commands

| ID | macOS | Linux | Windows |
| --- | --- | --- | --- |
| `cursor` | `brew install --cask cursor` | `Add the Cursor apt/dnf repo, then `sudo apt install cursor` — https://cursor.com/docs/get-started/installation` | `winget install Anysphere.Cursor` |
| `claude-code` | `brew install --cask claude-code` | `curl -fsSL https://claude.ai/install.sh \| bash` | `winget install Anthropic.ClaudeCode` |
| `vscode` | `brew install --cask visual-studio-code` | `sudo snap install --classic code` | `winget install Microsoft.VisualStudioCode` |
| `vscode-insiders` | `brew install --cask visual-studio-code@insiders` | `sudo snap install --classic code-insiders` | `winget install Microsoft.VisualStudioCode.Insiders` |
| `codex` | `brew install --cask codex` | `npm install -g @openai/codex` | `npm install -g @openai/codex` |
| `gemini` | `npm install -g @google/gemini-cli` | `npm install -g @google/gemini-cli` | `npm install -g @google/gemini-cli` |
| `antigravity` | `brew install --cask antigravity` | `Download from https://antigravity.google/download` | `Download from https://antigravity.google/download` |
| `antigravity-ide` | `brew install --cask antigravity-ide` | `Download from https://antigravity.google/download` | `Download from https://antigravity.google/download` |
| `antigravity-cli` | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` | `irm https://antigravity.google/cli/install.ps1 \| iex` |
| `devin-desktop` | `brew install --cask devin-desktop` | `Add the Devin apt/yum repo, then `sudo apt install devin-desktop` — https://docs.devin.ai/desktop/getting-started` | `winget install CognitionAI.DevinDesktop` |
| `devin-cli` | `brew install --cask devin-cli` | `curl -fsSL https://cli.devin.ai/install.sh \| bash` | `irm https://static.devin.ai/cli/setup.ps1 \| iex` |

## Notices

- **Gemini CLI** — Gemini CLI stopped serving free and Google One accounts on 2026-06-18. Consumer users should pick Antigravity CLI instead.

## Former ids

Renamed tools keep answering to their old id in `--agents`, profiles and manifests.

| Former id | Current id |
| --- | --- |
| `windsurf` | `devin-desktop` |

## Verification

| ID | Verified | Checked against |
| --- | --- | --- |
| `cursor` | 2026-09-14 | <https://cursor.com/docs/context/mcp>, <https://cursor.com/docs/get-started/installation> |
| `claude-code` | 2026-09-14 | <https://code.claude.com/docs/en/mcp>, <https://code.claude.com/docs/en/setup> |
| `vscode` | 2026-09-14 | <https://code.visualstudio.com/docs/agents/reference/mcp-configuration>, <https://code.visualstudio.com/docs/setup/linux> |
| `vscode-insiders` | 2026-09-14 | <https://code.visualstudio.com/docs/agents/reference/mcp-configuration>, <https://code.visualstudio.com/docs/configure/profiles> |
| `codex` | 2026-09-14 | <https://learn.chatgpt.com/docs/config-file/config-reference>, <https://learn.chatgpt.com/docs/extend/mcp?surface=cli> |
| `gemini` | 2026-09-14 | <https://geminicli.com/docs/tools/mcp-server/>, <https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/> |
| `antigravity` | 2026-09-14 | <https://antigravity.google/docs/mcp/>, <https://antigravity.google/docs/cli/getting-started/> |
| `antigravity-ide` | 2026-09-14 | <https://antigravity.google/docs/mcp/>, <https://antigravity.google/docs/cli/getting-started/> |
| `antigravity-cli` | 2026-09-14 | <https://antigravity.google/docs/mcp/>, <https://antigravity.google/docs/cli/getting-started/> |
| `devin-desktop` | 2026-09-14 | <https://docs.devin.ai/cli/extensibility/mcp/configuration>, <https://docs.devin.ai/desktop/getting-started> |
| `devin-cli` | 2026-09-14 | <https://docs.devin.ai/cli>, <https://docs.devin.ai/cli/extensibility/mcp/configuration> |
