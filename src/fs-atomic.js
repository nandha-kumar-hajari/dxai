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

// Atomically write a string to filePath. Optional mode sets file permissions
// (e.g. 0o600 for files that may carry secret references).
export function writeFileAtomic(filePath, data, { mode } = {}) {
  fs.ensureDirSync(path.dirname(filePath));
  const tmp = tempPath(filePath);
  try {
    fs.writeFileSync(tmp, data, mode ? { mode } : undefined);
    fs.moveSync(tmp, filePath, { overwrite: true });
    if (mode !== undefined) fs.chmodSync(filePath, mode);
  } finally {
    if (fs.existsSync(tmp)) fs.removeSync(tmp);
  }
}

// Atomically write an object as pretty JSON.
export function writeJsonAtomic(filePath, obj, { spaces = 2, mode } = {}) {
  writeFileAtomic(filePath, JSON.stringify(obj, null, spaces) + '\n', { mode });
}
