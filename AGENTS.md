# AGENTS.md

> Single source of truth for all AI agents working in this repo.
> All agent-specific config files (CLAUDE.md, .cursorrules, copilot-instructions, etc.) point here.

## Project

**dxai** — Interactive CLI to bootstrap AI-powered dev environments across Cursor, Claude Code, VS Code/Copilot, Codex, Gemini CLI, Windsurf, and Antigravity. One command configures MCP servers, agent skills, cursor rules, and project instruction files in the right format for each tool.

## Tech Stack

- **Runtime**: Node.js 18+ (ES modules only, no CommonJS)
- **Language**: JavaScript (no TypeScript, but JSDoc is welcome)
- **CLI framework**: Commander.js v14
- **Interactive prompts**: Inquirer.js
- **Tests**: `node:test` + `node:assert/strict` (42+ tests)
- **CI**: GitHub Actions (Ubuntu/macOS/Windows x Node 18/20/22)

## Architecture

```
bin/cli.js              → Commander entry point, exports buildProgram()
src/index.js            → Main orchestration: run(), apply(), saveProfileCmd()
src/config-writer.js    → All file writers (JSON, TOML, CLI, markdown)
src/config-remover.js   → Manifest-aware config removal
src/detect.js           → OS, agent, prerequisite detection
src/detect-project.js   → Stack, tooling, git, maturity inference
src/profile.js          → Profile load/merge/save/discovery
src/manifest.js         → Install manifest tracking (.dxai/manifest.json)
src/inspect.js          → list / status / doctor commands
src/update.js           → Remote registry refresh
src/cleanup.js          → Manifest-aware cleanup
src/runtime.js          → Option normalization
src/branding.js         → Banner, colors, message helpers
src/registry/
  loader.js             → Cache > bundled JSON resolution
  mcp-servers.js        → MCP server catalog re-export
  skills.js             → Skills catalog re-export
  stacks.js             → Tech stacks, rules, template generators
  data/
    mcp-servers.json    → MCP server catalog (90+ servers)
    skills.json         → Skills catalog (13+ skills)
```

## Data Flow

1. **Detect** — OS, installed agents, prerequisites, project stack/tooling/maturity
2. **Collect** — Interactive prompts or CLI flags; resolve profile
3. **Validate** — Unknown IDs throw with "Known: ..." hint
4. **Write** — Merge configs, substitute placeholders, back up existing files, record manifest
5. **Record** — Entries written to `~/.dxai/manifest.json` (system) and `.dxai/manifest.json` (project)

## Commands

```
dxai system             # Global IDE configs, MCP servers, skills
dxai project            # Repo-local rules, CLAUDE.md, AGENTS.md, stack detection
dxai both               # System + project in one go
dxai apply [profile]    # Non-interactive from a saved profile
dxai save-profile       # Persist selections as reusable profile
dxai list / status / doctor   # Manifest inspection and drift detection
dxai cleanup / reset    # Remove dxai-managed configs
dxai update             # Refresh registry cache from remote
```

## Coding Conventions

- ES modules only — `import`/`export`, never `require()`
- One responsibility per file
- Destructuring over repeated property access
- `async/await` throughout — no raw callbacks or `.then()` chains
- Throw with context; catch specifically; validate at boundaries
- No `console.log` for debugging in committed code — use the branding helpers for user-facing output
- Quiet/loud modes: `--json` suppresses spinners, colors, and decorative text

## Testing Conventions

- Framework: `node:test` with `node:assert/strict`
- Run: `npm test` (or `node --test 'test/**/*.test.js'`)
- Smoke: `npm run smoke`
- Pattern: temp directories, isolated file ops, no side effects
- Test names describe scenarios: "merges new server into existing config", not "test mergeJson"
- Mock at boundaries (filesystem), not between internal modules

## Key Rules

- Read 2-3 similar files before generating new code — match existing patterns
- No placeholder implementations (TODO without issue, empty function bodies)
- Dead code gets deleted, not commented out
- No hardcoded URLs, ports, secrets, or environment-specific values
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- One logical change per commit
- Config writes must be idempotent — merge, don't overwrite
- Always back up existing config files before modifying them
- Record all writes to the manifest for drift detection

## Agent-Specific Notes

### Template Generators (src/registry/stacks.js)

This file contains `buildAgentsMd()`, `buildClaudeMd()`, `buildGeminiMd()`, and `buildCursorRule()` — the functions that generate instruction files for *other* projects. Changes here affect every user's generated output. Test with multiple stack combinations before shipping.

### Registry Data (src/registry/data/)

JSON catalogs for MCP servers and skills. Each server entry includes per-agent config formats (`configs.cursor`, `configs.claude-code`, etc.). Validate new entries against the existing shape — a typo in a config key silently breaks that agent's setup.

### Profile System (src/profile.js)

Discovery chain: `./.dxai/profile.json` -> `~/.dxai/config.json` -> `~/.dxairc(.json)`. CLI flags always beat profile values. `PROFILE_KEYS` whitelist controls what's persisted.
