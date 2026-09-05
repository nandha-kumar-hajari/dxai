import fs from 'fs-extra';
import path from 'path';
import { execFileSync } from 'child_process';

// ── Stack Signal Mapping ──

const STACK_SIGNALS = {
  react:  { deps: ['react', 'next', 'react-dom', '@remix-run/react'] },
  vue:    { deps: ['vue', 'nuxt', '@nuxt/kit'] },
  svelte: { deps: ['svelte', '@sveltejs/kit'] },
  node:   { deps: ['express', 'fastify', 'koa', 'hono', '@nestjs/core'] },
  python: { files: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'] },
  go:     { files: ['go.mod'] },
  rust:   { files: ['Cargo.toml'] },
  mobile: { deps: ['react-native', 'expo'], files: ['pubspec.yaml'] },
};

// ── Manifest Detection ──

function detectManifests(cwd) {
  const manifests = { found: false, pkg: null, scripts: {}, deps: {}, devDeps: {}, workspaces: null };

  const manifestFiles = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pubspec.yaml'];
  for (const f of manifestFiles) {
    if (fs.existsSync(path.join(cwd, f))) {
      manifests.found = true;
      break;
    }
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = fs.readJsonSync(pkgPath);
      manifests.pkg = pkg;
      manifests.scripts = pkg.scripts || {};
      manifests.deps = pkg.dependencies || {};
      manifests.devDeps = pkg.devDependencies || {};
      manifests.workspaces = pkg.workspaces || null;
    } catch {
      // Malformed package.json
    }
  }

  return manifests;
}

// ── Stack Detection ──

function detectStacks(cwd, manifests) {
  const allDeps = { ...manifests.deps, ...manifests.devDeps };
  const detected = [];

  for (const [stackId, signals] of Object.entries(STACK_SIGNALS)) {
    let matched = false;

    if (signals.deps) {
      for (const dep of signals.deps) {
        if (allDeps[dep]) {
          matched = true;
          break;
        }
      }
    }

    if (!matched && signals.files) {
      for (const f of signals.files) {
        if (fs.existsSync(path.join(cwd, f))) {
          matched = true;
          break;
        }
      }
    }

    if (matched) detected.push(stackId);
  }

  return detected;
}

// ── Git Info Detection ──

// All git calls use execFileSync (argv form, no shell) with any line-counting
// done in JS — the previous `| head -1` / `| wc -l` pipes silently failed under
// Windows cmd.exe, zeroing the stats and skewing maturity classification.
function git(args, cwd) {
  return execFileSync('git', args, { stdio: 'pipe', timeout: 5000, cwd }).toString().trim();
}

function detectGitInfo(cwd) {
  const defaults = { isRepo: false, commitCount: 0, ageInDays: 0, contributorCount: 0 };

  try {
    git(['rev-parse', '--is-inside-work-tree'], cwd);
  } catch {
    return defaults;
  }

  const info = { isRepo: true, commitCount: 0, ageInDays: 0, contributorCount: 0 };

  try {
    info.commitCount = parseInt(git(['rev-list', '--count', 'HEAD'], cwd), 10) || 0;
  } catch { /* empty repo or no commits */ }

  try {
    // Root commit(s), then their timestamp — cheap even in huge repos.
    const rootSha = git(['rev-list', '--max-parents=0', 'HEAD'], cwd).split('\n')[0];
    if (rootSha) {
      const firstTs = git(['show', '-s', '--format=%ct', rootSha], cwd);
      const ageMs = Date.now() - parseInt(firstTs, 10) * 1000;
      info.ageInDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    }
  } catch { /* no commits */ }

  try {
    const authors = git(['shortlog', '-sn', '--no-merges', 'HEAD'], cwd);
    info.contributorCount = authors ? authors.split('\n').length : 0;
  } catch { /* no commits */ }

  return info;
}

// ── Tooling Detection ──

function detectTooling(cwd, pkg) {
  const tooling = {
    linter: null,
    formatter: null,
    testFramework: null,
    hasTestDir: false,
    ci: null,
    packageManager: null,
  };

  const exists = (f) => fs.existsSync(path.join(cwd, f));

  const linterChecks = [
    { type: 'eslint', files: ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts'] },
    { type: 'biome', files: ['biome.json', 'biome.jsonc'] },
    { type: 'ruff', files: ['ruff.toml', '.ruff.toml'] },
    { type: 'golangci-lint', files: ['.golangci.yml', '.golangci.yaml'] },
  ];
  for (const check of linterChecks) {
    for (const f of check.files) {
      if (exists(f)) {
        tooling.linter = { type: check.type, configFile: f };
        break;
      }
    }
    if (tooling.linter) break;
  }

  const formatterChecks = [
    { type: 'prettier', files: ['.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.json', '.prettierrc.yml', 'prettier.config.js', 'prettier.config.mjs', 'prettier.config.cjs'] },
    { type: 'biome', files: ['biome.json', 'biome.jsonc'] },
    { type: 'rustfmt', files: ['rustfmt.toml', '.rustfmt.toml'] },
  ];
  for (const check of formatterChecks) {
    for (const f of check.files) {
      if (exists(f)) {
        tooling.formatter = { type: check.type, configFile: f };
        break;
      }
    }
    if (tooling.formatter) break;
  }

  const allDeps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (allDeps['vitest']) {
    tooling.testFramework = { type: 'vitest' };
  } else if (allDeps['jest']) {
    tooling.testFramework = { type: 'jest' };
  } else if (allDeps['mocha']) {
    tooling.testFramework = { type: 'mocha' };
  } else if (exists('pytest.ini') || exists('pyproject.toml')) {
    // Check pyproject.toml for pytest config
    if (exists('pyproject.toml')) {
      try {
        const content = fs.readFileSync(path.join(cwd, 'pyproject.toml'), 'utf-8');
        if (content.includes('[tool.pytest') || content.includes('pytest')) {
          tooling.testFramework = { type: 'pytest' };
        }
      } catch { /* ignore */ }
    }
    if (!tooling.testFramework && exists('pytest.ini')) {
      tooling.testFramework = { type: 'pytest' };
    }
  }

  const testDirs = ['test', 'tests', '__tests__', 'spec'];
  tooling.hasTestDir = testDirs.some((d) => exists(d));

  if (exists('.github/workflows')) {
    tooling.ci = { type: 'github-actions', path: '.github/workflows/' };
  } else if (exists('.gitlab-ci.yml')) {
    tooling.ci = { type: 'gitlab-ci', path: '.gitlab-ci.yml' };
  } else if (exists('.circleci')) {
    tooling.ci = { type: 'circleci', path: '.circleci/' };
  }

  if (exists('pnpm-lock.yaml')) {
    tooling.packageManager = 'pnpm';
  } else if (exists('yarn.lock')) {
    tooling.packageManager = 'yarn';
  } else if (exists('bun.lockb') || exists('bun.lock')) {
    tooling.packageManager = 'bun';
  } else if (exists('package-lock.json')) {
    tooling.packageManager = 'npm';
  }

  return tooling;
}

// ── Command Extraction ──

function extractCommands(pkg, packageManager) {
  const commands = {};
  if (!pkg?.scripts) return commands;

  const pm = packageManager || 'npm';
  const runPrefix = pm === 'npm' ? 'npm run' : pm;

  const knownScripts = {
    dev: ['dev', 'start:dev', 'serve'],
    test: ['test', 'test:unit', 'test:all'],
    build: ['build'],
    lint: ['lint', 'lint:fix'],
    format: ['format', 'fmt'],
    typecheck: ['typecheck', 'type-check', 'types:check', 'check-types'],
  };

  for (const [key, scriptNames] of Object.entries(knownScripts)) {
    for (const name of scriptNames) {
      if (pkg.scripts[name]) {
        // Use shorthand for common npm scripts
        if (pm === 'npm' && (name === 'test' || name === 'start')) {
          commands[key] = `npm ${name}`;
        } else {
          commands[key] = `${runPrefix} ${name}`;
        }
        break;
      }
    }
  }

  return commands;
}

// ── Maturity Classification ──

function classifyMaturity(exists, git) {
  if (!exists || git.commitCount < 5) return 'greenfield';
  if (git.commitCount <= 50 && git.ageInDays < 90) return 'early';
  if (git.commitCount > 500 || git.ageInDays > 365 || git.contributorCount > 5) return 'mature';
  return 'established';
}

// ── Monorepo Detection ──

function detectMonorepo(cwd, manifests) {
  const result = { detected: false, type: null };

  if (manifests.workspaces) {
    result.detected = true;
    result.type = 'npm-workspaces';
    return result;
  }

  if (fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'))) {
    result.detected = true;
    result.type = 'pnpm-workspaces';
    return result;
  }

  if (fs.existsSync(path.join(cwd, 'lerna.json'))) {
    result.detected = true;
    result.type = 'lerna';
    return result;
  }

  if (fs.existsSync(path.join(cwd, 'nx.json'))) {
    result.detected = true;
    result.type = 'nx';
    return result;
  }

  if (fs.existsSync(path.join(cwd, 'turbo.json'))) {
    result.detected = true;
    result.type = 'turborepo';
    return result;
  }

  return result;
}

// ── Main Export ──

export function detectProject(cwd) {
  const manifests = detectManifests(cwd);
  const git = detectGitInfo(cwd);
  const detectedStacks = detectStacks(cwd, manifests);
  const tooling = detectTooling(cwd, manifests.pkg);
  const commands = extractCommands(manifests.pkg, tooling.packageManager);
  const monorepo = detectMonorepo(cwd, manifests);
  const maturity = classifyMaturity(manifests.found, git);

  return {
    exists: manifests.found,
    maturity,
    detectedStacks,
    git,
    tooling,
    monorepo,
    commands,
  };
}
