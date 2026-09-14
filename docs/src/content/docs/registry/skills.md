---
title: Skills
description: "14 agent skills across 3 categories. Auto-generated from src/registry/data/skills.json."
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: src/registry/data/skills.json (generator: scripts/docs/gen-skills.mjs)
-->

Skills are downloadable instruction packages that teach AI agents specialized capabilities. They're sourced from official and community GitHub repos and installed into your project.

Pick skills in the wizard, or pass `--skills <id1>,<id2>` to `dxai-cli system`. ★ marks recommended (pre-checked) entries.

Skills are installed into `.agents/skills/` (read natively by Codex, Cursor, Devin and Antigravity) and mirrored into `.claude/skills/` when Claude Code is selected — the only location it discovers.

## 🔵 Anthropic Official

| ID | Name | Description | Source repo | Path |
| --- | --- | --- | --- | --- |
| `frontend-design` | ★ Frontend Design | Production-grade UI with high design quality | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/frontend-design` |
| `skill-creator` | ★ Skill Creator | Create, test, and optimize custom skills | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/skill-creator` |
| `docx` | Document (docx) | Professional Word document generation | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/docx` |
| `pdf` | PDF | PDF creation, extraction, and manipulation | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/pdf` |
| `pptx` | Presentation (pptx) | Slide deck and presentation creation | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/pptx` |
| `xlsx` | Spreadsheet (xlsx) | Excel/spreadsheet generation | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/xlsx` |
| `algorithmic-art` | Algorithmic Art | Generative art and creative coding | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/algorithmic-art` |
| `canvas-design` | Canvas Design | HTML Canvas-based visual design | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/canvas-design` |
| `mcp-builder` | MCP Server Builder | Build custom MCP servers | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/mcp-builder` |
| `webapp-testing` | Web App Testing | Automated testing for web applications | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/webapp-testing` |
| `claude-api` | Claude API | Build apps with the Claude API | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/claude-api` |
| `web-artifacts-builder` | Web Artifacts Builder | Build interactive web artifacts | [`anthropics/skills`](https://github.com/anthropics/skills) | `skills/web-artifacts-builder` |

## ▲ Vercel Labs

| ID | Name | Description | Source repo | Path |
| --- | --- | --- | --- | --- |
| `find-skills` | Find Skills | Discover and install agent skills | [`vercel-labs/skills`](https://github.com/vercel-labs/skills) | `skills/find-skills` |

## 🌍 Community

| ID | Name | Description | Source repo | Path |
| --- | --- | --- | --- | --- |
| `better-auth` | Better Auth | Authentication best practices | [`better-auth/skills`](https://github.com/better-auth/skills) | `better-auth/best-practices` |
