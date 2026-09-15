import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { recordProjectSkills, readManifest, manifestSkillDirs, PROJECT_MANIFEST_PATH } from '../src/manifest.js';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxai-msk-')); });
afterEach(() => { if (tmp) fs.removeSync(tmp); });

test('recordSkills accumulates every directory a skill was written to, mirrors included', () => {
  const dirA = path.join(tmp, 'a', '.agents', 'skills');
  const mirrorA = path.join(tmp, 'a', '.claude', 'skills');
  recordProjectSkills({ installed: ['frontend-design'], directory: dirA, extraDirectories: [mirrorA] }, tmp);
  const dirB = path.join(tmp, 'b', '.agents', 'skills');
  recordProjectSkills({ installed: ['frontend-design'], directory: dirB, extraDirectories: [] }, tmp);

  const m = readManifest(path.join(tmp, PROJECT_MANIFEST_PATH));
  const entry = m.skills['frontend-design'];
  assert.equal(entry.path, dirB); // latest base dir for older readers
  assert.deepEqual(new Set(entry.dirs), new Set([
    path.join(dirA, 'frontend-design'), path.join(mirrorA, 'frontend-design'), path.join(dirB, 'frontend-design'),
  ]));
  assert.deepEqual(new Set(manifestSkillDirs(entry, 'frontend-design')), new Set(entry.dirs));
});

test('manifestSkillDirs understands the legacy { path } shape', () => {
  assert.deepEqual(manifestSkillDirs({ path: '/p/.agents/skills' }, 'docx'), ['/p/.agents/skills/docx']);
  assert.deepEqual(manifestSkillDirs(undefined, 'docx'), []);
});
