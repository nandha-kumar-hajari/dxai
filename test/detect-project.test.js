import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectProject } from '../src/detect-project.js';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-dp-')); });
afterEach(() => { if (tmp) fs.removeSync(tmp); });

test('greenfield: no manifests', () => {
  const p = detectProject(tmp);
  assert.equal(p.exists, false);
  assert.equal(p.maturity, 'greenfield');
  assert.deepEqual(p.detectedStacks, []);
});

test('detects react via package.json deps', () => {
  fs.writeJsonSync(path.join(tmp, 'package.json'), {
    name: 'x',
    dependencies: { react: '19', next: '15' },
  });
  const p = detectProject(tmp);
  assert.equal(p.exists, true);
  assert.ok(p.detectedStacks.includes('react'));
});

test('detects python via pyproject.toml', () => {
  fs.writeFileSync(path.join(tmp, 'pyproject.toml'), '[tool.pytest]\n');
  const p = detectProject(tmp);
  assert.ok(p.detectedStacks.includes('python'));
  assert.equal(p.tooling.testFramework?.type, 'pytest');
});

test('detects monorepo via npm workspaces', () => {
  fs.writeJsonSync(path.join(tmp, 'package.json'), {
    name: 'x',
    workspaces: ['packages/*'],
  });
  const p = detectProject(tmp);
  assert.equal(p.monorepo.detected, true);
  assert.equal(p.monorepo.type, 'npm-workspaces');
});

test('detects monorepo via turbo.json', () => {
  fs.writeFileSync(path.join(tmp, 'turbo.json'), '{}');
  const p = detectProject(tmp);
  assert.equal(p.monorepo.detected, true);
  assert.equal(p.monorepo.type, 'turborepo');
});

test('extracts commands from scripts using detected pkg manager', () => {
  fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
  fs.writeJsonSync(path.join(tmp, 'package.json'), {
    name: 'x',
    scripts: { dev: 'vite', build: 'vite build', lint: 'eslint .' },
  });
  const p = detectProject(tmp);
  assert.equal(p.tooling.packageManager, 'pnpm');
  assert.equal(p.commands.dev, 'pnpm dev');
  assert.equal(p.commands.build, 'pnpm build');
  assert.equal(p.commands.lint, 'pnpm lint');
});

test('detects ESLint via flat config', () => {
  fs.writeJsonSync(path.join(tmp, 'package.json'), { name: 'x' });
  fs.writeFileSync(path.join(tmp, 'eslint.config.js'), 'export default [];');
  const p = detectProject(tmp);
  assert.equal(p.tooling.linter?.type, 'eslint');
});
