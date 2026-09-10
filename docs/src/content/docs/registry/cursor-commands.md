---
title: Cursor Commands
description: "5 pre-built Cursor slash commands installed by dxai project."
---
<!--
AUTO-GENERATED — do not edit by hand.
Regenerate via: npm run docs:generate
Source: src/registry/stacks.js (CURSOR_COMMANDS) — generator: scripts/docs/gen-cursor-commands.mjs
-->

Pre-built Cursor slash commands installed by `dxai project` when you enable the `cursor-commands` feature. Cursor retired `.cursor/commands/` in favour of skills, so each command lands in `.cursor/skills/<name>/SKILL.md` with `disable-model-invocation: true` — invoked explicitly as `/pr`, never picked up automatically.

## Commands

| Slash command | File | Title | Step 1 |
| --- | --- | --- | --- |
| `/pr` | `pr/SKILL.md` | Create Pull Request | Look at all staged and unstaged changes with `git diff` |
| `/fix-issue` | `fix-issue/SKILL.md` | Fix GitHub Issue | Accept an issue number as input |
| `/review` | `review/SKILL.md` | Code Review | Run the linter on all changed files |
| `/test-all` | `test-all/SKILL.md` | Run All Tests | Detect the test framework being used (jest, vitest, pytest, go test, etc.) |
| `/refactor` | `refactor/SKILL.md` | Refactor Module | Accept a file or directory path as input |

## Full bodies

Each generated file is a Cursor command body. The full text is reproduced below for reference.

### `/pr`

```markdown
# Create Pull Request

1. Look at all staged and unstaged changes with `git diff`
2. Write a clear commit message following conventional commits format
3. Stage all changes and commit
4. Push to the current branch
5. Use `gh pr create` to open a PR with a descriptive title and body
6. Return the PR URL when done
```

### `/fix-issue`

```markdown
# Fix GitHub Issue

1. Accept an issue number as input
2. Fetch the issue details using `gh issue view`
3. Analyze the issue description and any linked code
4. Find the relevant files in the codebase
5. Implement the fix following project conventions
6. Write tests for the fix
7. Run the test suite to verify
8. Create a PR that references the issue with "Fixes #<number>"
```

### `/review`

```markdown
# Code Review

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
```

### `/test-all`

```markdown
# Run All Tests

1. Detect the test framework being used (jest, vitest, pytest, go test, etc.)
2. Run the full test suite
3. If any tests fail, analyze the failures
4. Suggest fixes for failing tests
5. Provide a summary of test results
```

### `/refactor`

```markdown
# Refactor Module

1. Accept a file or directory path as input
2. Analyze the current code structure
3. Identify code smells: duplication, long functions, deep nesting, etc.
4. Propose a refactoring plan
5. Wait for approval before proceeding
6. Implement the refactoring step by step
7. Run tests after each step to ensure nothing breaks
8. Provide a before/after summary
```
