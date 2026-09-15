// `.bak.<ts>` snapshots — the one place that mints backup names, shared by the
// config writers (before they modify a file) and `dxai rollback` (before it
// restores one), so the two can never disagree about the format.
//
// The suffix is `YYYY-MM-DDTHH-MM-SS-mmm`: millisecond resolution plus a
// collision check, because two writes to the same file in one second (a
// scripted `add a; add b`, or a rollback undone straight away) used to mint the
// same name and silently overwrite the earlier snapshot.

import fs from 'fs-extra';
import path from 'path';

// How many snapshots to keep per file. Older ones are pruned on each new backup
// so repeated runs can't accumulate snapshots forever.
export const MAX_BACKUPS_PER_FILE = 5;

// Matches the ts suffix of `<name>.bak.<ts>` (with or without milliseconds).
export const BACKUP_SUFFIX_RE = /\.bak\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?(?:-\d+)?)$/;

export function backupTimestampNow(date = new Date()) {
  // 2026-09-14T15:42:51.123Z → 2026-09-14T15-42-51-123
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 23);
}

// A backup path for `filePath` that does not exist yet.
export function nextBackupPath(filePath, date = new Date()) {
  const base = `${filePath}.bak.${backupTimestampNow(date)}`;
  if (!fs.existsSync(base)) return base;
  for (let i = 1; ; i++) {
    const candidate = `${base}-${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
}

export function pruneOldBackups(filePath, keep = MAX_BACKUPS_PER_FILE) {
  const dir = path.dirname(filePath);
  const prefix = `${path.basename(filePath)}.bak.`;
  let siblings;
  try {
    siblings = fs.readdirSync(dir).filter((f) => f.startsWith(prefix));
  } catch {
    return;
  }
  // Timestamp suffixes sort lexicographically == chronologically.
  siblings.sort().reverse();
  for (const stale of siblings.slice(keep)) {
    try { fs.removeSync(path.join(dir, stale)); } catch { /* best-effort */ }
  }
}

// Snapshot `filePath` (when it exists) to a fresh `.bak.<ts>` sibling and prune
// older snapshots. Returns the backup path, or null when there was nothing to back up.
export function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = nextBackupPath(filePath);
  fs.copySync(filePath, backupPath);
  pruneOldBackups(filePath);
  return backupPath;
}
