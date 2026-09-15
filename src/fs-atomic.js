// Atomic file writes — write to a unique temp sibling, then rename over the
// target. A rename on the same filesystem is atomic, so a crash mid-write can
// never leave a user's config/manifest truncated: either the old file survives
// intact or the new one is fully in place.

import fs from 'fs-extra';
import path from 'path';

// Monotonic-ish suffix so concurrent writes in the same process don't collide.
// (Date.now/Math.random are avoided elsewhere in the codebase, but here we only
// need uniqueness for a transient temp name, and process.hrtime is monotonic.)
let counter = 0;
function tempPath(filePath) {
  const unique = `${process.pid}.${counter++}.${process.hrtime.bigint()}`;
  return path.join(path.dirname(filePath), `.${path.basename(filePath)}.${unique}.tmp`);
}

// Permission bits of an existing file, or undefined when it does not exist.
function existingMode(filePath) {
  try {
    return fs.statSync(filePath).mode & 0o777;
  } catch {
    return undefined;
  }
}

// Atomically write a string to filePath. Optional mode sets file permissions
// (e.g. 0o600 for files that may carry secret references). When no mode is
// given, an existing file keeps its permissions: the rename would otherwise
// replace a 0600 config (written that way because it can carry secrets) with a
// default-umask 0644 one every time a server is removed from it.
export function writeFileAtomic(filePath, data, { mode } = {}) {
  fs.ensureDirSync(path.dirname(filePath));
  const effectiveMode = mode ?? existingMode(filePath);
  const tmp = tempPath(filePath);
  try {
    fs.writeFileSync(tmp, data, effectiveMode !== undefined ? { mode: effectiveMode } : undefined);
    fs.moveSync(tmp, filePath, { overwrite: true });
    if (effectiveMode !== undefined) fs.chmodSync(filePath, effectiveMode);
  } finally {
    if (fs.existsSync(tmp)) fs.removeSync(tmp);
  }
}

// Atomically write an object as pretty JSON.
export function writeJsonAtomic(filePath, obj, { spaces = 2, mode } = {}) {
  writeFileAtomic(filePath, JSON.stringify(obj, null, spaces) + '\n', { mode });
}
