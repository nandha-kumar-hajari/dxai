import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const HOME = os.homedir();

// Keys allowed to live in a profile. Anything else is dropped silently
// (forward-compatibility for new keys without erroring on old ones).
export const PROFILE_KEYS = [
  'mode',       // 'system' | 'project' | 'both'
  'agents',     // string[]
  'mcp',        // string[]
  'skills',     // string[]
  'features',   // string[]
  'stack',      // string[]
  'mcpInputs',  // { [serverId]: { [inputKey]: value } }
];

// Default project-level profile location.
export const PROJECT_PROFILE_PATH = path.join('.dxai', 'profile.json');

// Default user-level profile dir.
export const USER_PROFILE_DIR = path.join(HOME, '.dxai', 'profiles');

// Auto-discovery: first existing wins.
export function findDefaultProfile(cwd = process.cwd()) {
  const candidates = [
    path.join(cwd, '.dxai', 'profile.json'),
    path.join(HOME, '.dxai', 'config.json'),
    path.join(HOME, '.dxairc'),
    path.join(HOME, '.dxairc.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Resolve `nameOrPath` to a real file path:
//   - if it ends with .json or contains a path separator, treat as path
//   - otherwise look up by name in user/project dirs
export function resolveProfile(nameOrPath, cwd = process.cwd()) {
  if (!nameOrPath) return findDefaultProfile(cwd);

  if (nameOrPath.includes(path.sep) || nameOrPath.endsWith('.json')) {
    const abs = path.isAbsolute(nameOrPath) ? nameOrPath : path.join(cwd, nameOrPath);
    return fs.existsSync(abs) ? abs : null;
  }

  const candidates = [
    path.join(cwd, '.dxai', `${nameOrPath}.json`),
    path.join(USER_PROFILE_DIR, `${nameOrPath}.json`),
    path.join(HOME, '.dxai', `${nameOrPath}.json`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function readProfile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile not found: ${filePath}`);
  }
  let data;
  try {
    data = fs.readJsonSync(filePath);
  } catch (err) {
    throw new Error(`Failed to parse profile ${filePath}: ${err.message}`);
  }
  const out = {};
  for (const k of PROFILE_KEYS) {
    if (data[k] !== undefined) out[k] = data[k];
  }
  return out;
}

// CLI flags take precedence over profile values.
// Only fills keys that are undefined on `cliOpts`.
export function mergeWithProfile(cliOpts, profile) {
  if (!profile) return cliOpts;
  const merged = { ...cliOpts };
  for (const key of PROFILE_KEYS) {
    if (merged[key] === undefined && profile[key] !== undefined) {
      merged[key] = profile[key];
    }
  }
  return merged;
}

// Save a profile. `target` is one of:
//   { user: true, name }   → ~/.dxai/profiles/<name>.json
//   { here: true }         → ./.dxai/profile.json
//   { path: '...' }        → exact path
export function saveProfile(data, target = { user: true, name: 'default' }) {
  const filtered = {};
  for (const k of PROFILE_KEYS) {
    if (data[k] !== undefined) filtered[k] = data[k];
  }

  let outPath;
  if (target.path) {
    outPath = target.path;
  } else if (target.here) {
    outPath = path.join(process.cwd(), PROJECT_PROFILE_PATH);
  } else {
    if (!target.name) throw new Error('saveProfile: target.name is required for user profiles');
    outPath = path.join(USER_PROFILE_DIR, `${target.name}.json`);
  }

  fs.ensureDirSync(path.dirname(outPath));
  fs.writeJsonSync(outPath, filtered, { spaces: 2 });
  return outPath;
}

// List discoverable profiles (user dir + cwd .dxai dir).
export function listProfiles(cwd = process.cwd()) {
  const found = [];

  for (const dir of [USER_PROFILE_DIR, path.join(cwd, '.dxai')]) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      for (const f of files) {
        found.push({
          name: path.basename(f, '.json'),
          path: path.join(dir, f),
          scope: dir === USER_PROFILE_DIR ? 'user' : 'project',
        });
      }
    } catch {
      // skip
    }
  }
  return found;
}
