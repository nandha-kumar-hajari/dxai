---
title: Changelog
description: "Auto-generated from git history. Grouped by conventional-commit type."
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: git log (generator: scripts/docs/gen-changelog.mjs)
-->

Auto-generated from git history. Conventional-commit prefixes (`feat:`, `fix:`, `chore:`, etc.) are grouped; everything else lands under "Other changes".

## Unreleased

### Features

- add fast-path `dxai add`/`remove` commands and `init` alias ([`7ae3f2e`](https://github.com/nandha-kumar-hajari/dxai/commit/7ae3f2e032e846b0355219aea33e579f6628050d))
- add dxai rollback to restore config backups ([`16d2978`](https://github.com/nandha-kumar-hajari/dxai/commit/16d29786b42876b51672a2dd390081dbce942139))
- centralize network timeout + retry/backoff in src/net.js ([`0a89340`](https://github.com/nandha-kumar-hajari/dxai/commit/0a893403039d10ba295ec46a82fe73806072b8c5))

### Bug fixes

- portable test runner; exclude changelog from docs drift gate ([`21a6df8`](https://github.com/nandha-kumar-hajari/dxai/commit/21a6df8e31f615e1c9c6b302b6703fe3486487eb))

### Refactor

- replace curl shell-out with native fetch in installSkills ([`539411e`](https://github.com/nandha-kumar-hajari/dxai/commit/539411e8dbc2d5ef7ef5edabcf91fb3dd2ca20d8))

### Documentation

- document add/remove/init fast-path commands ([`5117469`](https://github.com/nandha-kumar-hajari/dxai/commit/51174697f09e1b9ffb2b2699d3832d5f516cac55))
- mark security & robustness items shipped; add rollback docs ([`81231ec`](https://github.com/nandha-kumar-hajari/dxai/commit/81231ec23b147d8b5a29f318e450b5038042e759))

### Tests

- cover installSkills fetch fallback; tighten SKILL.md guard ([`72783dc`](https://github.com/nandha-kumar-hajari/dxai/commit/72783dcb9e0f939e2a94dd23416ed16b9d8e69f1))

### Other changes

- Merge pull request #3 from nandha-kumar-hajari/audit-fixes ([`13630d9`](https://github.com/nandha-kumar-hajari/dxai/commit/13630d931e3c4d60665c3f75eaf875eaa7e56716))
- Refactor registry for security  handling and enhance validation. Introduce atomic file write operations for safer config and manifest updates. Implement comprehensive validation for registry data to prevent command injection and ensure safe execution. Update AGENTS.md to document new features and clarify registry data handling. Improve cleanup processes to maintain accurate system and project manifests. Enhance tests for atomic file operations and registry validation. ([`f4e6188`](https://github.com/nandha-kumar-hajari/dxai/commit/f4e6188ce30a2761d86b3ac7c5c17fde5fae7c1b))
- Update AGENTS.md and ROADMAP.md to reflect new features and improvements. Enhance testing coverage from 42 to 81 tests, add release/versioning guidelines, and document the new periodic catalog auto-refresh feature. Update CLI options for registry versioning and handshake testing, and improve agent definitions for better transport handling. Modify config writer to support version pinning for package specifications. ([`adc4cf7`](https://github.com/nandha-kumar-hajari/dxai/commit/adc4cf7f225531a828a0f787ea5147dcf807d10b))
- Add automation tool detection and installation features. Introduce new CLI option for automation tools, enhance runtime to handle tool selection, and implement installation logic for agent-browser and agent-device. Update manifest to record installed tools and modify related files for improved project structure. ([`4a7cd32`](https://github.com/nandha-kumar-hajari/dxai/commit/4a7cd32b8094b8952feb1b548eae138a5e3bf979))
- Added Agent Rules ([`9bcd535`](https://github.com/nandha-kumar-hajari/dxai/commit/9bcd53572eaf63a1f7f447ad5ff90f97e249e3de))
- Enhance CLI and agent detection features. Update agent definitions to include new Antigravity IDE and CLI applications. Improve command detection logic to check for both command-line tools and installed applications on macOS. Modify CLI options to reflect updated agent IDs. ([`7099150`](https://github.com/nandha-kumar-hajari/dxai/commit/70991508af51ccb2da0884b8df3631d13f9a9472))
- Merge pull request #1 from nandha-kumar-hajari/astro-docs ([`5f3d119`](https://github.com/nandha-kumar-hajari/dxai/commit/5f3d119ba9faa552f77aab153c90ecb8f3653257))
- Update documentation and references to reflect project name change to 'dxai'. Modify links in README.md, guide, and reference documents to point to the new repository. Enhance .gitignore to exclude Playwright test runner outputs and cache files. Update configuration files for consistency with the new project structure. ([`9576e5c`](https://github.com/nandha-kumar-hajari/dxai/commit/9576e5cfffc2395dc66af3cfe68ca6af3a66bf3f))
- Update project structure and documentation. Enhance .gitignore to exclude build artifacts and Playwright session files. Modify package.json and package-lock.json to reflect project name change to 'dxai' and add new scripts for documentation management. Improve README.md with detailed CLI usage instructions and features. Introduce CI workflow for documentation drift checks. ([`8d39143`](https://github.com/nandha-kumar-hajari/dxai/commit/8d39143d9be1ef7854dd1c63d7f48ad6897ede54))
- Enhance CLI functionality and documentation. Introduce new commands for managing profiles, introspection, and registry updates. Update package.json with new scripts and dependencies. Add a roadmap for future development and implement CI workflow for testing and validation. ([`02adb05`](https://github.com/nandha-kumar-hajari/dxai/commit/02adb05043af13205fefcb0e7bb850ca15ae6f6b))
- Enhance project configuration and detection features. Introduce project detection logic to identify tech stacks, tooling, and Git info. Update cursor rules and project instruction writers to support optional profile injection. Refactor AGENTS.md and CLAUDE.md generation to utilize new detection capabilities. ([`54712c0`](https://github.com/nandha-kumar-hajari/dxai/commit/54712c0a4f670859afc79a7b46bf8c46459e25e0))
- Rename project, updating all references in package.json, README.md, CLI, and source files to reflect the new name. Adjust branding and cleanup messages accordingly. ([`fc728e4`](https://github.com/nandha-kumar-hajari/dxai/commit/fc728e4e74a7022dca00fda93b3010410bf95571))
- Implement CLI cleanup command and local development instructions; add .gitignore and package-lock.json files, remove deprecated cli.js and skills.js files. ([`f8b071e`](https://github.com/nandha-kumar-hajari/dxai/commit/f8b071e5cc892a4c200bcb1004714b02bfcbb33d))
- Add interactive CLI for AI-powered development environment setup, including branding, configuration writing, OS detection, agent management, and MCP server integration. ([`7a846fb`](https://github.com/nandha-kumar-hajari/dxai/commit/7a846fb6d537f4326addae36e94ac411c1dc0ee9))
