// ══════════════════════════════════════════════
// Tech Stack Registry
// ══════════════════════════════════════════════

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

// Cursor rules templates per stack
export const CURSOR_RULES = {
  general: `---
description: General development best practices
globs: "**/*"
alwaysApply: true
---

# General Rules

- Always start with plan mode for complex tasks
- Use sequential thinking for multi-step problems
- Run tests after making changes
- Write clear commit messages following conventional commits
- Prefer TypeScript over JavaScript where possible
- Use ESLint and Prettier for code formatting
- Always handle errors appropriately — no silent catches
- Add comments only for complex logic, not obvious code
- Use meaningful variable and function names
- Keep functions small and focused (single responsibility)
`,

  react: `---
description: React and Next.js development rules
globs: "**/*.{tsx,jsx,ts,js}"
alwaysApply: true
---

# React / Next.js Rules

- Use functional components with hooks (no class components)
- Prefer Server Components by default in Next.js App Router
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
- Use \`use context7\` when working with library APIs
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
- Use \`use context7\` when working with library APIs
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
- Use \`use context7\` when working with library APIs
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
- Docstrings: Google style for public functions and classes
- Use \`use context7\` when working with library APIs
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
- Environment variables: use dotenv + Zod schema validation
- Use Winston or Pino for structured logging (not console.log in prod)
- Database: use Drizzle ORM or Prisma with migrations
- Tests: Vitest or Jest with supertest for API testing
- Docker: multi-stage builds, non-root user, .dockerignore
- Use \`use context7\` when working with library APIs
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
- Use \`use context7\` when working with library APIs
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
- Use \`use context7\` when working with library APIs
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
- Use \`use context7\` when working with library APIs
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

// CLAUDE.md template
export const CLAUDE_MD_TEMPLATE = `# Project Instructions

## Overview
<!-- Brief description of what this project does -->

## Tech Stack
<!-- Will be auto-filled based on your selection -->
{{STACK_DESCRIPTION}}

## Code Style
- Follow the conventions established in the existing codebase
- Use meaningful variable and function names
- Keep functions focused on a single responsibility
- Handle errors explicitly — never ignore them

## Testing
- Write tests for all new functionality
- Run the test suite before creating PRs
- Aim for meaningful test coverage, not 100% line coverage

## Git Workflow
- Use conventional commits (feat:, fix:, chore:, docs:, etc.)
- Create feature branches from main
- Keep PRs focused and small

## MCP Usage
- Use \`context7\` for up-to-date library documentation
- Use the browser MCP for UI debugging and verification
- Use the GitHub MCP for issue and PR management

## Important Paths
<!-- Add your key directories here -->
- \`src/\` — Application source code
- \`tests/\` — Test files
- \`docs/\` — Documentation
`;

// GEMINI.md template
export const GEMINI_MD_TEMPLATE = `# Project Context

## Overview
<!-- Brief description of what this project does -->

## Tech Stack
{{STACK_DESCRIPTION}}

## Conventions
- Follow existing code patterns and conventions
- Use type annotations/hints where the language supports them
- Write tests for new functionality
- Use conventional commits for git messages

## Key Directories
- \`src/\` — Application source code
- \`tests/\` — Test files
`;
