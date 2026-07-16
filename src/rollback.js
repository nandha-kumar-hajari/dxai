// `dxai rollback` — restore a config/project file from the most recent
// `.bak.<ts>` snapshot dxai wrote before it last modified that file.
//
// Every writer backs up the target as `<file>.bak.<ts>` (see backupFile in
// config-writer.js). This command finds those snapshots next to the files dxai
// manages, picks the newest per file, and restores it — snapshotting the current
// file first so the rollback is itself reversible.

import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

import {
  printBanner, sectionHeader, successMsg, warnMsg, infoMsg, theme,
} from './branding.js';
import { AGENT_DEFINITIONS } from './detect.js';
import { scanBackupFiles, scanProjectFiles } from './config-remover.js';

// Timestamp suffix of a `<name>.bak.<ts>` file (`YYYY-MM-DDTHH-MM-SS`), or '' if
// the name doesn't carry one.
const BAK_RE = /\.bak\.([0-9T-]+)$/;
export function backupTimestamp(backupPath) {
  const m = path.basename(backupPath).match(BAK_RE);
  return m ? m[1] : '';
}

// The most recent `.bak.<ts>` sibling of `originalPath`, or null if none exist.
// The timestamp format is lexicographically ordered, so a string max is
// chronological — no date parsing needed.
export function latestBackupFor(originalPath) {
  const backups = scanBackupFiles([originalPath]).filter((b) => BAK_RE.test(b));
  if (backups.length === 0) return null;
  let best = null;
  let bestTs = '';
  for (const b of backups) {
    const ts = backupTimestamp(b);
    if (ts >= bestTs) { bestTs = ts; best = b; }
  }
  return { backup: best, ts: bestTs };
}

// For each candidate original path, find its newest backup. Returns
// [{ original, backup, ts }] only for paths that actually have a backup.
export function collectRestorable(originalPaths) {
  const out = [];
  const seen = new Set();
  for (const original of originalPaths) {
    if (!original || seen.has(original)) continue;
    seen.add(original);
    const latest = latestBackupFor(original);
    if (latest) out.push({ original, backup: latest.backup, ts: latest.ts });
  }
  return out;
}

// Fresh backup timestamp, mirroring config-writer's backupFile format.
function nowTs() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// Restore `backup` over `original`, first snapshotting the current `original`
// (when it exists) to `<original>.bak.<ts>` so the rollback can be undone.
export function restoreBackup(original, backup, { dryRun = false } = {}) {
  const result = { original, backup, savedCurrentTo: null };
  if (dryRun) return result;
  if (fs.existsSync(original)) {
    const snapshot = `${original}.bak.${nowTs()}`;
    fs.copySync(original, snapshot);
    result.savedCurrentTo = snapshot;
  }
  fs.copySync(backup, original, { overwrite: true });
  return result;
}

// The files dxai may have backed up: file-based agent global configs (CLI agents
// write no files) plus dxai-generated project files in the cwd.
export function candidateOriginals(home, cwd) {
  const agentPaths = AGENT_DEFINITIONS
    .filter((a) => a.configFormat !== 'cli')
    .map((a) => { try { return a.globalMcpPath(home); } catch { return null; } })
    .filter(Boolean);
  const projectPaths = scanProjectFiles(cwd).map((f) => f.absolutePath);
  return [...agentPaths, ...projectPaths];
}

// Render an absolute path with the home dir collapsed to `~` for readability.
function displayPath(p, home) {
  return p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

export async function rollbackCmd(opts = {}) {
  const json = !!opts.json;
  const dryRun = !!opts.dryRun || process.env.DXAI_DRY_RUN === '1';
  const listOnly = !!opts.list;
  const home = os.homedir();
  const cwd = process.cwd();

  const restorable = collectRestorable(candidateOriginals(home, cwd));

  if (!json) {
    printBanner();
    sectionHeader('Rollback — restore config backups');
  }

  if (restorable.length === 0) {
    if (json) {
      process.stdout.write(JSON.stringify({ ok: true, restored: [], available: [] }, null, 2) + '\n');
    } else {
      infoMsg('No dxai backup files (.bak.*) found to restore from.');
      console.log();
    }
    return;
  }

  // List-only: report available backups and stop.
  if (listOnly) {
    if (json) {
      process.stdout.write(JSON.stringify({ ok: true, available: restorable }, null, 2) + '\n');
      return;
    }
    for (const r of restorable) {
      console.log(`  ${theme.label(displayPath(r.original, home))}`);
      console.log(`    ${theme.dim(`↩ ${path.basename(r.backup)}`)}`);
    }
    console.log();
    infoMsg('Run `dxai rollback` to restore, or `--dry-run` to preview.');
    console.log();
    return;
  }

  // Select which files to restore. Non-interactive (--yes / --json) restores the
  // latest backup for every file; interactive lets the user pick.
  let selected = restorable;
  if (!opts.yes && !json) {
    const { picks } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'picks',
        message: 'Select files to restore from their latest backup:',
        choices: restorable.map((r) => ({
          name: `${displayPath(r.original, home)}  ${theme.dim(`(${path.basename(r.backup)})`)}`,
          value: r.original,
          checked: true,
        })),
      },
    ]);
    selected = restorable.filter((r) => picks.includes(r.original));
  }

  if (selected.length === 0) {
    if (!json) { infoMsg('Nothing selected.'); console.log(); }
    else process.stdout.write(JSON.stringify({ ok: true, restored: [] }, null, 2) + '\n');
    return;
  }

  const restored = [];
  for (const r of selected) {
    const res = restoreBackup(r.original, r.backup, { dryRun });
    restored.push({ ...res, ts: r.ts });
  }

  if (json) {
    process.stdout.write(JSON.stringify({ ok: true, dryRun, restored }, null, 2) + '\n');
    return;
  }

  console.log();
  for (const r of restored) {
    if (dryRun) {
      infoMsg(`Would restore ${displayPath(r.original, home)} ← ${path.basename(r.backup)}`);
    } else {
      successMsg(`Restored ${displayPath(r.original, home)} ← ${path.basename(r.backup)}`);
      if (r.savedCurrentTo) {
        console.log(`    ${theme.dim(`(previous version saved to ${path.basename(r.savedCurrentTo)})`)}`);
      }
    }
  }
  console.log();
  if (dryRun) warnMsg('Dry run — no files were changed.');
  console.log();
}
