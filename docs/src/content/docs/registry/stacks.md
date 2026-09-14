---
title: Tech Stacks
description: "8 stacks recognized; each generates a stack-specific Cursor rule file."
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: src/registry/stacks.js (TECH_STACKS, CURSOR_RULES) — generator: scripts/docs/gen-stacks.mjs
-->

Stacks dxai recognizes from your project. When you select stacks during `dxai-cli project`, dxai writes a corresponding `.mdc` rule file into `.cursor/rules/` (in addition to a universal `general.mdc`).

Pass `--stack <id1>,<id2>` for non-interactive runs. Detected stacks are pre-checked in the wizard.

Detection signals: `package.json` dependencies (React/Vue/Svelte/Node/mobile), or manifest files (`pyproject.toml`, `go.mod`, `Cargo.toml`, `pubspec.yaml`).

## Supported stacks

| ID | Label | Rule file | Conventions |
| --- | --- | --- | --- |
| `react` | React / Next.js / TypeScript | `react.mdc` | React and Next.js development rules |
| `vue` | Vue / Nuxt | `vue.mdc` | Vue and Nuxt development rules |
| `svelte` | Svelte / SvelteKit | `svelte.mdc` | Svelte and SvelteKit development rules |
| `python` | Python / FastAPI / Django | `python.mdc` | Python development rules |
| `node` | Node.js / Express | `node.mdc` | Node.js backend development rules |
| `go` | Go / Gin / Echo | `go.mdc` | Go development rules |
| `rust` | Rust | `rust.mdc` | Rust development rules |
| `mobile` | React Native / Flutter | `mobile.mdc` | Mobile development rules |

## Universal rules

A `general.mdc` is always written, regardless of which stacks you pick. It covers planning, sequential thinking, conventional commits, error handling, and security defaults.
