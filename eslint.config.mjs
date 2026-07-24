// Flat ESLint config for the CLI itself (the docs site has its own toolchain).
// Keep this minimal: recommended rules + the repo's own conventions
// (intentional empty catches at file-absence boundaries, `_`-prefixed unused).

import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['docs/**', 'node_modules/**', '.playwright-mcp/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // File-absence / best-effort boundaries legitimately swallow errors here;
      // each such catch carries an explanatory comment per AGENTS.md.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },
];
