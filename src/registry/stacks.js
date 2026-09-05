// ── Tech Stack Registry ──

export const TECH_STACKS = [
  { id: 'react', name: 'React', label: 'React / Next.js / TypeScript' },
  { id: 'vue', name: 'Vue', label: 'Vue / Nuxt' },
  { id: 'svelte', name: 'Svelte', label: 'Svelte / SvelteKit' },
  { id: 'python', name: 'Python', label: 'Python / FastAPI / Django' },
  { id: 'node', name: 'Node.js', label: 'Node.js / Express' },
  { id: 'go', name: 'Go', label: 'Go / Gin / Echo' },
  { id: 'rust', name: 'Rust', label: 'Rust' },
  { id: 'mobile', name: 'Mobile', label: 'React Native / Flutter' },
];

// ── Agent Rules — Universal + Per-Stack ──

const AGENT_RULES = {
  universal: {
    code_quality: [
      'No `any` in TypeScript. Use `unknown` + type guards.',
      'No barrel files (index.ts re-exports). Import from source.',
      'Functions over 40 lines need splitting.',
      'No magic numbers/strings. Extract to named constants.',
      'Dead code gets deleted, not commented out.',
      'No default exports except where frameworks require them (pages/routes).',
      'Match existing code patterns. Read 2-3 similar files before generating new ones.',
      'No placeholder implementations (TODO, "implement this", empty function bodies).',
    ],
    error_handling: [
      'Every catch block must recover, rethrow with context, or log + return typed error. No empty catches.',
      'User-facing errors get human-readable messages. Internal errors get structured logging.',
      'API boundaries validate all input. Trust nothing from outside your system boundary.',
      'Never swallow errors silently. If you catch it, handle it.',
    ],
    anti_patterns: [
      'No `eslint-disable` or `@ts-ignore` without an explaining comment.',
      'No `console.log` for debugging in committed code.',
      'No hardcoded URLs, ports, secrets, or environment-specific values.',
      'No catching errors just to re-throw without context.',
      'No God objects or junk-drawer util files.',
      'No string concatenation for SQL, HTML, or shell commands.',
      'No commented-out code blocks. Delete or use version control.',
      'No `// TODO` without a linked issue or ticket number.',
    ],
    testing: [
      'Test behavior, not implementation. Tests survive refactors.',
      'Every bug fix gets a regression test before the fix.',
      'Mock at system boundaries (HTTP, DB, filesystem), not between internal modules.',
      'Test names describe scenarios: "returns 404 when user not found", not "test getUserById".',
    ],
    git: [
      'Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.',
      'One logical change per commit. Never mix refactoring with features.',
      'PR descriptions explain WHY, not just WHAT.',
    ],
  },
  stacks: {
    react: {
      rules: [
        'Server Components by default. `"use client"` only for hooks, event handlers, browser APIs.',
        'No prop drilling past 2 levels. Use composition or context.',
        '`useEffect` is for synchronization, not data fetching. Use server components, server actions, or React Query.',
        'No `index` as key for dynamic lists. Use stable unique IDs.',
        'Co-locate: `Button.tsx`, `Button.test.tsx`, styles in one directory.',
        'Type all props with interfaces. Export prop types for reusable components.',
        'Zod for all runtime validation (forms, API responses).',
        'Prefer Tailwind CSS utility classes over custom CSS.',
      ],
      anti_patterns: [
        'No `useEffect` for derived state — use `useMemo`.',
        'No wrapping everything in `React.memo` without profiling first.',
        'No API calls directly in components — use server components, server actions, or data hooks.',
        'No class components. Functional components with hooks only.',
        'No `<div>` soup. Use semantic HTML elements.',
      ],
    },
    vue: {
      rules: [
        'Composition API with `<script setup>` only. No Options API.',
        'TypeScript strict mode in all `.vue` and `.ts` files.',
        'Use `defineProps` and `defineEmits` with type-only syntax.',
        'Pinia for state management. No Vuex.',
        'Nuxt: use `useFetch`/`useAsyncData` for data fetching, not raw `fetch` in components.',
        'Component naming: PascalCase for SFCs, kebab-case in templates.',
        'Use VueUse composables before writing custom ones.',
      ],
      anti_patterns: [
        'No Options API (`data()`, `methods`, `computed` as options).',
        'No direct DOM manipulation — use template refs.',
        'No Vuex in new code. Use Pinia.',
        'No `v-html` with user-provided content (XSS risk).',
      ],
    },
    svelte: {
      rules: [
        'TypeScript in all Svelte components and modules.',
        'Use `$state`, `$derived`, `$effect` runes (Svelte 5).',
        'Form actions for mutations, load functions for data.',
        'Keep components small — extract logic into `.ts` modules.',
        'Use `+layout.server.ts` for shared data loading.',
        'SvelteKit for all new projects.',
      ],
      anti_patterns: [
        'No Svelte 4 reactive declarations (`$:`) — use Svelte 5 runes.',
        'No client-side data fetching in `+page.svelte` — use `+page.ts` or `+page.server.ts`.',
        'No `onMount` for data loading — use load functions.',
      ],
    },
    python: {
      rules: [
        'Type hints on every function signature.',
        'Pydantic models for all external data. No raw dicts for structured data.',
        '`pathlib.Path` not `os.path`. f-strings not `.format()`.',
        'Python 3.11+ features: match statements, `ExceptionGroup`, `TaskGroup`.',
        'FastAPI: dependency injection, `response_model` on all endpoints.',
        'pytest with fixtures, parametrize, and conftest.py.',
        'Ruff for linting and formatting.',
        'async/await for IO-bound operations (httpx, databases, file ops).',
      ],
      anti_patterns: [
        'No bare `except:` — always specify the exception type.',
        'No mutable default arguments (`def f(x=[])`).',
        'No `from module import *`.',
        'No `os.path` — use `pathlib`.',
        'No global state or module-level side effects.',
      ],
    },
    node: {
      rules: [
        'Validate all external input at API boundaries with Zod/Joi.',
        'Dependency injection. No importing DB clients directly in handlers.',
        'All env config loaded once at startup via validated schema. No scattered `process.env.X`.',
        'ES modules only (`import`/`export`). No CommonJS `require()`.',
        'Structured logging with Pino or Winston. No `console.log` in production.',
        'async/await only. No raw callbacks or `.then()` chains.',
        'Express: middleware pattern, router modules, centralized error handlers.',
        'Database: Drizzle ORM or Prisma with migrations.',
      ],
      anti_patterns: [
        'No `require()` — use ESM imports.',
        'No nested callbacks (callback hell).',
        'No swallowing errors with generic 500 responses. Return typed errors.',
        'No `any` types. TypeScript strict mode.',
        'No synchronous filesystem operations in request handlers.',
      ],
    },
    go: {
      rules: [
        'Always check errors. Use `fmt.Errorf` with `%w` for wrapping.',
        'Standard project layout: `cmd/`, `internal/`, `pkg/`.',
        'Interfaces for dependency injection and testability.',
        'Use `context.Context` for cancellation and deadlines.',
        'Table-driven tests with `t.Run()` subtests.',
        'Structured logging with `slog` (stdlib) or `zerolog`.',
        'golangci-lint with project `.golangci.yml` config.',
        'Go 1.22+ features: range over int, enhanced routing patterns.',
      ],
      anti_patterns: [
        'No `panic` for expected error cases — return errors.',
        'No `interface{}` — use `any` (Go 1.18+) or typed generics.',
        'No `init()` functions unless absolutely necessary.',
        'No global mutable state. Pass dependencies explicitly.',
      ],
    },
    rust: {
      rules: [
        'Prefer `Result<T, E>` over `unwrap()`. Handle errors properly.',
        '`thiserror` for library errors, `anyhow` for application errors.',
        'Axum or Actix-web for HTTP services.',
        '`serde` for all serialization/deserialization.',
        'Clippy: run with `--all-targets -- -D warnings`.',
        'Unit tests in same file (`#[cfg(test)]`), integration tests in `tests/` directory.',
        'Rust 2021 edition or later.',
      ],
      anti_patterns: [
        'No `.unwrap()` or `.expect()` in library/production code — propagate errors with `?`.',
        'No `clone()` to satisfy the borrow checker without understanding why.',
        'No `unsafe` blocks without a `// SAFETY:` comment explaining the invariant.',
        'No manual `Drop` implementations unless managing raw resources.',
      ],
    },
    mobile: {
      rules: [
        'React Native: Expo for new projects, bare workflow only when needed.',
        'React Native: React Navigation v7+ for routing.',
        'React Native: Zustand or React Query for state management.',
        'Flutter: BLoC pattern or Riverpod for state management.',
        'Flutter: `freezed` for immutable data classes.',
        'Test on both iOS and Android before PR.',
        'Handle offline states and loading states gracefully.',
        'Platform-specific code isolated behind abstraction layers.',
      ],
      anti_patterns: [
        'No platform-specific code scattered across the codebase — isolate it.',
        'No blocking the UI thread with heavy computations.',
        'No hardcoded pixel values — use responsive/adaptive layouts.',
        'No ignoring platform design guidelines (Material on Android, HIG on iOS).',
      ],
    },
  },
};

// ── Cursor Rules — Tightened ──

export const CURSOR_RULES = {
  general: `---
description: General development best practices
globs: "**/*"
alwaysApply: true
---

# General Rules

- Plan before coding. For multi-file changes, list all files first.
- Run tests after every change. Not done until green.
- No empty catches. No silent failures. Handle all errors with context.
- No \`any\` types. No \`eslint-disable\` without justification. No \`console.log\` in committed code.
- Dead code gets deleted, not commented out.
- Conventional commits: \`feat:\`, \`fix:\`, \`chore:\`, one logical change per commit.
- Match existing patterns. Read 2-3 similar files before generating new ones.
- Use \`context7\` to look up library APIs — do not guess.
`,

  react: `---
description: React and Next.js development rules
globs: "**/*.{tsx,jsx,ts,js}"
alwaysApply: true
---

# React / Next.js Rules

- Use functional components with hooks (no class components)
- Server Components by default in Next.js App Router
- Add "use client" directive only when hooks or interactivity is needed
- Use TypeScript strict mode — no \`any\` types
- Colocate components: component, styles, tests in same directory
- Use React.memo() and useMemo/useCallback only when profiling shows need
- Prefer Tailwind CSS utility classes over custom CSS
- Use shadcn/ui or Radix primitives for accessible UI components
- Next.js: use metadata API for SEO, not <Head>
- Next.js: use Image component with proper width/height
- Next.js: prefer Server Actions over API routes for form mutations
- Zod for all runtime validation (forms, API responses)
- State management: React Context for simple state, Zustand for complex

# DO NOT

- No \`useEffect\` for derived state — use \`useMemo\`
- No \`index\` as key for dynamic lists — use stable unique IDs
- No API calls directly in components — use server actions or data hooks
- No prop drilling past 2 levels — use composition or context
- No wrapping everything in \`React.memo\` without profiling first
`,

  vue: `---
description: Vue and Nuxt development rules
globs: "**/*.{vue,ts,js}"
alwaysApply: true
---

# Vue / Nuxt Rules

- Use Composition API with <script setup> (no Options API)
- TypeScript with strict mode in all .vue and .ts files
- Use defineProps and defineEmits with type-only syntax
- Prefer Pinia for state management
- Use auto-imports for Vue APIs and composables
- Nuxt: use useFetch/useAsyncData for data fetching
- Nuxt: use definePageMeta for page-level metadata
- Component naming: PascalCase for SFCs, kebab-case in templates
- Use VueUse composables before writing custom ones

# DO NOT

- No Options API (\`data()\`, \`methods\`, \`computed\` as options)
- No Vuex in new code — use Pinia
- No direct DOM manipulation — use template refs
- No \`v-html\` with user-provided content (XSS risk)
`,

  svelte: `---
description: Svelte and SvelteKit development rules
globs: "**/*.{svelte,ts,js}"
alwaysApply: true
---

# Svelte / SvelteKit Rules

- Use TypeScript in all Svelte components and modules
- Prefer SvelteKit for all new projects
- Use $state, $derived, $effect runes (Svelte 5)
- Use form actions for mutations, load functions for data
- Keep components small — extract logic into .ts modules
- Use +layout.server.ts for shared data loading

# DO NOT

- No Svelte 4 reactive declarations (\`$:\`) — use Svelte 5 runes
- No client-side data fetching in \`+page.svelte\` — use load functions
- No \`onMount\` for data loading — use \`+page.ts\` or \`+page.server.ts\`
`,

  python: `---
description: Python development rules
globs: "**/*.py"
alwaysApply: true
---

# Python Rules

- Use Python 3.11+ features (match statements, ExceptionGroup, etc.)
- Type hints on all function signatures — use \`from typing import\` as needed
- Pydantic v2 for data validation and settings management
- FastAPI: use dependency injection, not global state
- FastAPI: always define response_model on endpoints
- Django: use class-based views, custom managers, and signals appropriately
- Use async/await where IO-bound (httpx, databases, file ops)
- pytest for testing — use fixtures, parametrize, and conftest.py
- Ruff for linting and formatting (replaces flake8 + black + isort)
- Use virtual environments (venv or uv) — never install globally

# DO NOT

- No bare \`except:\` — always specify the exception type
- No mutable default arguments (\`def f(x=[])\`)
- No \`from module import *\`
- No \`os.path\` — use \`pathlib.Path\`
- No global state or module-level side effects
`,

  node: `---
description: Node.js backend development rules
globs: "**/*.{ts,js,mts,mjs}"
alwaysApply: true
---

# Node.js Rules

- TypeScript with strict mode for all backend code
- Use ES modules (import/export) — no CommonJS require()
- Express: use middleware pattern, router modules, error handlers
- Validate all input with Zod or Joi at API boundaries
- Use async/await — never raw callbacks or .then() chains
- Environment variables: load once at startup via validated schema, no scattered \`process.env.X\`
- Use Winston or Pino for structured logging (not console.log in prod)
- Database: use Drizzle ORM or Prisma with migrations
- Tests: Vitest or Jest with supertest for API testing
- Docker: multi-stage builds, non-root user, .dockerignore

# DO NOT

- No \`require()\` — use ESM imports
- No nested callbacks (callback hell)
- No swallowing errors with generic 500 responses — return typed errors
- No synchronous filesystem operations in request handlers
- No importing DB clients directly in handlers — use dependency injection
`,

  go: `---
description: Go development rules
globs: "**/*.go"
alwaysApply: true
---

# Go Rules

- Use Go 1.22+ features (range over int, enhanced routing)
- Follow standard project layout (cmd/, internal/, pkg/)
- Error handling: always check errors, use fmt.Errorf with %w for wrapping
- Use interfaces for dependency injection and testability
- Gin or Echo for HTTP APIs — use middleware pattern
- Use context.Context for cancellation and deadlines
- Table-driven tests with t.Run() subtests
- Use golangci-lint with a .golangci.yml config
- Structured logging with slog (stdlib) or zerolog

# DO NOT

- No \`panic\` for expected error cases — return errors
- No \`interface{}\` — use \`any\` (Go 1.18+) or typed generics
- No \`init()\` functions unless absolutely necessary
- No global mutable state — pass dependencies explicitly
`,

  rust: `---
description: Rust development rules
globs: "**/*.rs"
alwaysApply: true
---

# Rust Rules

- Use Rust 2021 edition or later
- Prefer Result<T, E> over unwrap() — handle errors properly
- Use thiserror for library errors, anyhow for application errors
- Axum or Actix-web for HTTP services
- Use serde for serialization/deserialization
- Clippy: run with --all-targets -- -D warnings
- Tests: unit tests in same file, integration tests in tests/ directory

# DO NOT

- No \`.unwrap()\` or \`.expect()\` in library/production code — use \`?\`
- No \`clone()\` to satisfy the borrow checker without understanding why
- No \`unsafe\` blocks without a \`// SAFETY:\` comment
- No manual \`Drop\` implementations unless managing raw resources
`,

  mobile: `---
description: Mobile development rules
globs: "**/*.{tsx,jsx,ts,js,dart}"
alwaysApply: true
---

# Mobile Development Rules

- React Native: use Expo for new projects, bare workflow only when needed
- React Native: use React Navigation v7+ for routing
- React Native: use Zustand or React Query for state
- Flutter: follow BLoC pattern or Riverpod for state management
- Flutter: use freezed for immutable data classes
- Always test on both iOS and Android before PR
- Handle offline states and loading states gracefully
- Platform-specific code isolated behind abstraction layers

# DO NOT

- No platform-specific code scattered across the codebase — isolate it
- No blocking the UI thread with heavy computations
- No hardcoded pixel values — use responsive/adaptive layouts
- No ignoring platform design guidelines (Material on Android, HIG on iOS)
`,
};

// Cursor commands templates
export const CURSOR_COMMANDS = {
  pr: `# Create Pull Request

1. Look at all staged and unstaged changes with \`git diff\`
2. Write a clear commit message following conventional commits format
3. Stage all changes and commit
4. Push to the current branch
5. Use \`gh pr create\` to open a PR with a descriptive title and body
6. Return the PR URL when done
`,

  'fix-issue': `# Fix GitHub Issue

1. Accept an issue number as input
2. Fetch the issue details using \`gh issue view\`
3. Analyze the issue description and any linked code
4. Find the relevant files in the codebase
5. Implement the fix following project conventions
6. Write tests for the fix
7. Run the test suite to verify
8. Create a PR that references the issue with "Fixes #<number>"
`,

  review: `# Code Review

1. Run the linter on all changed files
2. Run the full test suite
3. Check for common issues:
   - Unused imports or variables
   - Missing error handling
   - Missing TypeScript types
   - Hardcoded values that should be config
   - Console.log statements that should be removed
   - Missing tests for new functionality
4. Summarize findings with severity levels (critical, warning, suggestion)
`,

  'test-all': `# Run All Tests

1. Detect the test framework being used (jest, vitest, pytest, go test, etc.)
2. Run the full test suite
3. If any tests fail, analyze the failures
4. Suggest fixes for failing tests
5. Provide a summary of test results
`,

  refactor: `# Refactor Module

1. Accept a file or directory path as input
2. Analyze the current code structure
3. Identify code smells: duplication, long functions, deep nesting, etc.
4. Propose a refactoring plan
5. Wait for approval before proceeding
6. Implement the refactoring step by step
7. Run tests after each step to ensure nothing breaks
8. Provide a before/after summary
`,
};

// ── Contextual Rules — Maturity-Aware ──

const CONTEXTUAL_RULES = {
  greenfield: {
    code_quality: [
      'Set up directory structure following framework conventions before writing features.',
      'Configure linting and formatting from day one.',
      'Set up CI pipeline early — even a basic lint + test workflow.',
    ],
    testing: [
      'Set up test infrastructure immediately: framework, config, first smoke test.',
      'High coverage is cheaper to build from the start than to add retroactively.',
    ],
    git: [
      'Set up branch protection and PR templates early.',
    ],
  },
  early: {
    code_quality: [
      'Establish and document patterns early — they become the standard.',
      'Configure linting and formatting before the codebase grows.',
    ],
    testing: [
      'Set up test infrastructure now. Coverage debt compounds fast.',
      'Write tests for core paths before adding features.',
    ],
    git: [
      'Establish commit conventions now while the team is small.',
    ],
  },
  established: {
    code_quality: [
      'Match existing code patterns exactly. Read 3-5 similar files before generating new ones.',
      'Do not introduce new patterns without discussing with the team first.',
      'Prefer incremental improvements over rewrites.',
    ],
    testing: [
      'Maintain existing test patterns. Do not switch test frameworks mid-project.',
      'Add tests for any code you touch, even if existing code lacked them.',
    ],
    git: [
      'Follow the existing commit message conventions visible in git log.',
    ],
  },
  mature: {
    code_quality: [
      'Match existing code patterns exactly. Read 3-5 similar files before generating new ones.',
      'Do not introduce new patterns without discussing with the team first.',
      'Prefer incremental improvements over rewrites.',
      'Consider backward compatibility for any public API changes.',
    ],
    testing: [
      'Maintain existing test patterns. Do not switch test frameworks mid-project.',
      'Add tests for any code you touch, even if existing code lacked them.',
      'Run the full test suite before submitting — regressions in mature codebases are costly.',
    ],
    git: [
      'Follow the existing commit message conventions visible in git log.',
      'Keep PRs small and focused — large changes in mature codebases are risky.',
    ],
  },
};

// ── Tooling Rules Builder ──

function buildToolingRules(profile) {
  const rules = [];
  if (profile.tooling.linter)
    rules.push(`Linter: ${profile.tooling.linter.type} (${profile.tooling.linter.configFile}). Run before committing.`);
  if (profile.tooling.formatter)
    rules.push(`Formatter: ${profile.tooling.formatter.type} (${profile.tooling.formatter.configFile}). Run before committing.`);
  if (profile.tooling.testFramework)
    rules.push(`Test framework: ${profile.tooling.testFramework.type}. Do not introduce a second test runner.`);
  if (profile.commands.test)
    rules.push(`Test command: \`${profile.commands.test}\``);
  if (profile.commands.lint)
    rules.push(`Lint command: \`${profile.commands.lint}\``);
  if (profile.commands.build)
    rules.push(`Build command: \`${profile.commands.build}\``);
  if (profile.commands.dev)
    rules.push(`Dev server: \`${profile.commands.dev}\``);
  if (profile.commands.typecheck)
    rules.push(`Type check: \`${profile.commands.typecheck}\``);
  if (profile.monorepo.detected)
    rules.push(`Monorepo (${profile.monorepo.type}). Changes may affect multiple packages.`);
  return rules;
}

// ── Cursor Rule Builder (with optional profile) ──

export function buildCursorRule(ruleId, profile) {
  const base = CURSOR_RULES[ruleId];
  if (!base) return null;
  if (!profile || ruleId !== 'general') return base;

  // Inject project context into general.mdc
  const lines = [MATURITY_NOTES[profile.maturity], ...buildToolingRules(profile)];
  return `${base.trimEnd()}\n\n# Project Context\n\n${formatRules(lines)}\n`;
}

// ── Builder Helpers ──

const MATURITY_NOTES = {
  greenfield: 'This is a new project — set up conventions and infrastructure early.',
  early: 'This is an early-stage project — establish patterns before the codebase grows.',
  established: 'This is an established codebase — match existing patterns exactly.',
  mature: 'This is a mature codebase — match existing patterns, prefer incremental changes over rewrites.',
};

function formatRules(rules) {
  return rules.map((r) => `- ${r}`).join('\n');
}

// The profile-derived fragments shared by CLAUDE.md and GEMINI.md: a maturity
// line appended to the Behavior section, and an optional commands/tooling section.
function profileSections(profile) {
  if (!profile) return { behaviorNote: '', commandsSection: '' };
  const toolingRules = buildToolingRules(profile);
  return {
    behaviorNote: `\n- ${MATURITY_NOTES[profile.maturity]}`,
    commandsSection: toolingRules.length > 0
      ? `\n## Project Commands & Tooling\n\n${formatRules(toolingRules)}\n`
      : '',
  };
}

function getStackNames(selectedStacks) {
  return selectedStacks
    .map((id) => TECH_STACKS.find((s) => s.id === id)?.label || id)
    .join(', ');
}

function composeStackRules(selectedStacks) {
  const sections = [];
  for (const stackId of selectedStacks) {
    const stack = AGENT_RULES.stacks[stackId];
    const meta = TECH_STACKS.find((s) => s.id === stackId);
    if (!stack || !meta) continue;

    let section = `## ${meta.name} Rules\n\n${formatRules(stack.rules)}`;
    if (stack.anti_patterns.length > 0) {
      section += `\n\n### DO NOT\n\n${formatRules(stack.anti_patterns)}`;
    }
    sections.push(section);
  }
  return sections.join('\n\n');
}

// ── Builder Functions ──

export function buildAgentsMd(selectedStacks, profile = null) {
  const u = AGENT_RULES.universal;
  const stackNames = getStackNames(selectedStacks);
  const stackRules = composeStackRules(selectedStacks);

  const ctx = CONTEXTUAL_RULES[profile?.maturity];

  const codeQuality = [...u.code_quality];
  if (ctx?.code_quality) codeQuality.push(...ctx.code_quality);

  const testing = [...u.testing];
  if (ctx?.testing) testing.push(...ctx.testing);

  const git = [...u.git];
  if (ctx?.git) git.push(...ctx.git);

  let projectContext = '<!-- Describe your project specifics below: architecture, key commands, env vars -->';
  if (profile) {
    const lines = [];
    const maturityLabel = `${profile.maturity} (${profile.git.commitCount} commits, ${profile.git.ageInDays} days)`;
    lines.push(`- **Maturity**: ${maturityLabel}`);
    if (profile.tooling.packageManager)
      lines.push(`- **Package manager**: ${profile.tooling.packageManager}`);
    const toolingRules = buildToolingRules(profile);
    for (const rule of toolingRules) {
      lines.push(`- ${rule}`);
    }
    projectContext = lines.join('\n');
  }

  return `# AGENTS.md — Rules for AI Agents

> Every AI agent working in this repo MUST follow these rules.

## Tech Stack

${stackNames}

## Code Quality

${formatRules(codeQuality)}

## Error Handling

${formatRules(u.error_handling)}

## Anti-Patterns — DO NOT

${formatRules(u.anti_patterns)}

## Testing

${formatRules(testing)}

## Git

${formatRules(git)}

${stackRules}

## Project Context

${projectContext}
`;
}

export function buildClaudeMd(selectedStacks, profile = null) {
  const stackNames = getStackNames(selectedStacks);
  const stackRules = composeStackRules(selectedStacks);

  const { behaviorNote, commandsSection } = profileSections(profile);

  return `# CLAUDE.md — Instructions for Claude Code

## Behavior

- Read the full file before editing. Do not assume structure from names.
- To fix a bug: find the failing test first. No test? Write one that reproduces it before fixing.
- After every change, run the relevant tests. Not done until tests pass.
- For multi-file changes, use extended thinking. List all files you'll touch first.
- Check for existing patterns before generating new files. Look at 2-3 similar files.${behaviorNote}

## MCP Tools

- Use \`context7\` to look up API docs before using any library. Do not guess from memory.
- Use GitHub MCP for issue/PR operations.
- Use browser MCP to verify UI changes visually.

## Tech Stack

${stackNames}

## Stack Rules

${stackRules}${commandsSection}`;
}

export function buildGeminiMd(selectedStacks, profile = null) {
  const stackNames = getStackNames(selectedStacks);
  const stackRules = composeStackRules(selectedStacks);

  const { behaviorNote, commandsSection } = profileSections(profile);

  return `# GEMINI.md — Instructions for Gemini

## Behavior

- Plan before coding. For multi-file changes, outline all affected files first.
- Match existing code style exactly. Check adjacent files before writing new code.
- Do not invent APIs that don't exist in the codebase. Verify first.
- Run tests after changes.${behaviorNote}

## Tech Stack

${stackNames}

## Stack Rules

${stackRules}${commandsSection}`;
}
