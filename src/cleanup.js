import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

import {
  printBanner, sectionHeader, successMsg, warnMsg,
  errorMsg, infoMsg, quiet, startSpinner,
} from './branding.js';
import { detectOS, AGENT_DEFINITIONS } from './detect.js';
import { MCP_SERVERS } from './registry/mcp-servers.js';
import { SKILLS } from './registry/skills.js';
import {
  scanJsonMcpConfig, removeJsonMcpServers,
  scanTomlMcpConfig, removeTomlMcpServers,
  scanClaudeCodeMcpServers, removeClaudeCodeMcpServers,
  scanBackupFiles, scanProjectFiles, isEmptyDir,
} from './config-remover.js';
import { normalizeOptions } from './runtime.js';
import { confirm, prompt } from './select.js';
import {
  readManifest, SYSTEM_MANIFEST_PATH, PROJECT_MANIFEST_PATH, writeManifest, unrecordMcp, manifestSkillDirs,
} from './manifest.js';
import { CURSOR_COMMANDS } from './registry/stacks.js';

const KNOWN_MCP_IDS = MCP_SERVERS.map((s) => s.id);

// Skills are installed into projects (`.agents/skills`, mirrored to
// `.claude/skills` — see installSkills) and the manifest records every
// directory written, so cleanup removes exactly those. Home-level skill
// folders (~/.claude/skills, ~/.cursor/skills, ...) are user territory dxai
// never writes to and are never scanned: a user's own skill that happens to
// share a catalogue id must not be deleted. The same goes for a project dir
// the manifest does not mention — no guessing by catalogue id.
function findManifestSkills(manifest) {
  const found = [];
  for (const [id, entry] of Object.entries(manifest.skills || {})) {
    for (const dir of manifestSkillDirs(entry, id)) {
      if (fs.existsSync(path.join(dir, 'SKILL.md'))) found.push({ id, path: dir, baseDir: path.dirname(dir) });
    }
  }
  return found;
}

// `npx skills` leaves a `skills-lock.json` in the project root next to
// `.agents/skills`. Once every skill it tracks has been removed the lock is
// orphaned; delete it then, and only then.
function pruneSkillsLocks(removedSkillPaths) {
  const removedByRoot = new Map();
  for (const p of removedSkillPaths) {
    const base = path.dirname(p);
    if (path.basename(base) !== 'skills') continue;
    const root = path.dirname(path.dirname(base));
    if (!removedByRoot.has(root)) removedByRoot.set(root, new Set());
    removedByRoot.get(root).add(path.basename(p));
  }
  for (const [root, removed] of removedByRoot) {
    const lock = path.join(root, 'skills-lock.json');
    if (!fs.existsSync(lock)) continue;
    try {
      const tracked = Object.keys(fs.readJsonSync(lock).skills || {});
      if (tracked.every((id) => removed.has(id))) fs.removeSync(lock);
    } catch { /* not ours to judge — leave it */ }
  }
}

// Build the candidate ID list for scanning. If the manifest has entries,
// prefer it (precise — we only target what dxai installed). Otherwise fall
// back to the full known set (legacy behavior for installs predating manifest).
function globalMcpPaths(agent, home) {
  const legacy = typeof agent.legacyGlobalMcpPaths === 'function' ? agent.legacyGlobalMcpPaths(home) : [];
  return [agent.globalMcpPath(home), ...legacy];
}

function candidateMcpIds(manifest, agentId) {
  if (manifest && manifest.mcp[agentId]) {
    const ids = Object.keys(manifest.mcp[agentId]);
    if (ids.length > 0) return ids;
  }
  return KNOWN_MCP_IDS;
}


// Checkbox values are `${agentId}::${serverId}` so one prompt can span agents;
// regroup the picks into { [agentId]: [serverId] }.
function groupPicks(picks) {
  const out = {};
  for (const pick of picks) {
    const [agentId, serverId] = pick.split('::');
    (out[agentId] ||= []).push(serverId);
  }
  return out;
}

function countIds(byAgent) {
  return Object.values(byAgent).reduce((sum, ids) => sum + ids.length, 0);
}

// ── System Cleanup ──

// ctx: { nonInteractive, dryRun, json, includeBackups }
// Returns a structured report of what was (or would be) removed.
async function runSystemCleanup(home, ctx) {
  const { nonInteractive, dryRun } = ctx;

  quiet(ctx, () => sectionHeader('System Cleanup — Scanning'));

  const spinner = startSpinner(ctx, 'Scanning global configs...');
  const manifest = readManifest(SYSTEM_MANIFEST_PATH);

  const agentFindings = [];
  for (const agent of AGENT_DEFINITIONS) {
    const finding = { agent, foundServers: [] };
    const ids = candidateMcpIds(manifest, agent.id);

    switch (agent.configFormat) {
      case 'json': {
        // Scan the current file plus any former location dxai used to write to.
        const paths = globalMcpPaths(agent, home);
        finding.foundServers = [...new Set(paths.flatMap((p) => scanJsonMcpConfig(p, agent.mcpKey, ids)))];
        finding.configPath = paths[0];
        break;
      }
      case 'toml': {
        const configPath = agent.globalMcpPath(home);
        finding.foundServers = scanTomlMcpConfig(configPath, ids);
        finding.configPath = configPath;
        break;
      }
      case 'cli': {
        finding.foundServers = scanClaudeCodeMcpServers(ids);
        break;
      }
    }

    if (finding.foundServers.length > 0) {
      agentFindings.push(finding);
    }
  }

  const foundSkills = findManifestSkills(manifest);

  // Manifest entries whose server/skill is no longer in the live config were
  // removed by hand (or by a rollback); they'd otherwise linger as phantom
  // drift in `list`/`status` forever. Drop them now, unless this is a dry run.
  const stale = {};
  for (const agent of AGENT_DEFINITIONS) {
    const recorded = Object.keys(manifest.mcp[agent.id] || {});
    if (recorded.length === 0) continue;
    const found = agentFindings.find((f) => f.agent.id === agent.id)?.foundServers || [];
    const gone = recorded.filter((id) => !found.includes(id));
    if (gone.length) stale[agent.id] = gone;
  }
  const staleSkills = Object.entries(manifest.skills || {})
    .filter(([id, entry]) => !manifestSkillDirs(entry, id).some((d) => fs.existsSync(path.join(d, 'SKILL.md'))))
    .map(([id]) => id);
  if (!dryRun) pruneSystemManifest(stale, [], staleSkills);

  // Scan backup files (only for file-based agents — CLI agents don't write backups,
  // and their globalMcpPath sits in $HOME which would surface unrelated .bak files)
  const backupTargets = AGENT_DEFINITIONS
    .filter((a) => a.configFormat !== 'cli')
    .map((a) => {
      try { return a.globalMcpPath(home); } catch { return null; }
    })
    .filter(Boolean);
  const foundBackups = scanBackupFiles(backupTargets);

  spinner?.stop();

  const totalMcpServers = agentFindings.reduce((sum, f) => sum + f.foundServers.length, 0);
  if (totalMcpServers === 0 && foundSkills.length === 0 && foundBackups.length === 0) {
    quiet(ctx, () => infoMsg('No dxai-managed system configurations found.'));
    return { mcp: {}, skills: [], backups: [] };
  }

  // Select MCP servers to remove — everything found in non-interactive mode.
  let mcpToRemove = {};
  if (totalMcpServers > 0) {
    if (nonInteractive) {
      for (const finding of agentFindings) {
        mcpToRemove[finding.agent.id] = [...finding.foundServers];
      }
    } else {
      console.log();
      sectionHeader('MCP Servers Found');

      const mcpChoices = [];
      for (const finding of agentFindings) {
        mcpChoices.push(new inquirer.Separator(chalk.cyan(`\n  ${finding.agent.name}`)));
        for (const serverId of finding.foundServers) {
          const server = MCP_SERVERS.find((s) => s.id === serverId);
          const label = server ? server.name : serverId;
          mcpChoices.push({
            name: `${label} (${finding.agent.name})`,
            value: `${finding.agent.id}::${serverId}`,
            checked: true,
          });
        }
      }

      console.log();
      const { selectedMcp } = await prompt([
        {
          type: 'checkbox',
          name: 'selectedMcp',
          message: 'Select MCP servers to remove:',
          choices: mcpChoices,
          pageSize: 25,
          loop: false,
        },
      ]);

      mcpToRemove = groupPicks(selectedMcp);
    }
  }

  // Select skills to remove — everything found in non-interactive mode.
  let skillsToRemove = [];
  if (foundSkills.length > 0) {
    if (nonInteractive) {
      skillsToRemove = foundSkills.map((s) => s.path);
    } else {
      console.log();
      sectionHeader('Installed Skills Found');

      const skillChoices = foundSkills.map((s) => {
        const skill = SKILLS.find((sk) => sk.id === s.id);
        const label = skill ? skill.name : s.id;
        return { name: `${label} (${s.path})`, value: s.path, checked: true };
      });

      console.log();
      const { selectedSkills } = await prompt([
        {
          type: 'checkbox',
          name: 'selectedSkills',
          message: 'Select skills to remove:',
          choices: skillChoices,
          pageSize: 20,
          loop: false,
        },
      ]);
      skillsToRemove = selectedSkills;
    }
  }

  // Backup files — non-interactive keeps them unless --backups was passed.
  let deleteBackups = false;
  if (foundBackups.length > 0) {
    if (nonInteractive) {
      deleteBackups = !!ctx.includeBackups;
    } else {
      console.log();
      deleteBackups = await confirm(`Delete ${foundBackups.length} backup file(s)?`, { defaultValue: false });
    }
  }

  const mcpCount = countIds(mcpToRemove);
  if (mcpCount === 0 && skillsToRemove.length === 0 && !deleteBackups) {
    quiet(ctx, () => infoMsg('Nothing selected for removal.'));
    return { mcp: {}, skills: [], backups: [] };
  }

  // Summary & confirm (interactive only)
  quiet(ctx, () => {
    console.log();
    sectionHeader(dryRun ? 'Cleanup Summary (dry run)' : 'Cleanup Summary');
    if (mcpCount > 0) infoMsg(`MCP servers to remove: ${mcpCount}`);
    if (skillsToRemove.length > 0) infoMsg(`Skills to remove: ${skillsToRemove.length}`);
    if (deleteBackups) infoMsg(`Backup files to delete: ${foundBackups.length}`);
  });

  if (!nonInteractive && !dryRun) {
    console.log();
    if (!(await confirm('Proceed with cleanup?', { defaultValue: false }))) {
      warnMsg('Cleanup cancelled.');
      return { mcp: {}, skills: [], backups: [], cancelled: true };
    }
  }

  const report = {
    mcp: mcpToRemove,
    skills: skillsToRemove,
    backups: deleteBackups ? [...foundBackups] : [],
  };

  // Execute (skipped entirely on --dry-run)
  if (dryRun) return report;

  quiet(ctx, () => {
    console.log();
    sectionHeader('Removing');
  });

  for (const [agentId, serverIds] of Object.entries(mcpToRemove)) {
    const agent = AGENT_DEFINITIONS.find((a) => a.id === agentId);
    if (!agent) continue;

    const spin = startSpinner(ctx, `Removing from ${agent.name}...`);

    try {
      switch (agent.configFormat) {
        case 'json': {
          let removed = 0;
          for (const configPath of globalMcpPaths(agent, home)) {
            if (fs.existsSync(configPath)) removed += removeJsonMcpServers(configPath, agent.mcpKey, serverIds).removed;
          }
          spin?.stop();
          quiet(ctx, () => successMsg(`Removed ${removed} server(s) from ${agent.name}`));
          break;
        }
        case 'toml': {
          const configPath = agent.globalMcpPath(home);
          const { removed } = removeTomlMcpServers(configPath, serverIds);
          spin?.stop();
          quiet(ctx, () => successMsg(`Removed ${removed} server(s) from ${agent.name}`));
          break;
        }
        case 'cli': {
          const { removed, errors } = removeClaudeCodeMcpServers(serverIds);
          spin?.stop();
          quiet(ctx, () => successMsg(`Removed ${removed} server(s) from ${agent.name}`));
          for (const err of errors) {
            quiet(ctx, () => warnMsg(`Failed to remove "${err.id}": ${err.error}`));
          }
          break;
        }
      }
    } catch (err) {
      spin?.stop();
      quiet(ctx, () => errorMsg(`Failed to clean ${agent.name}: ${err.message}`));
    }
  }

  const removedSkillPaths = [];
  for (const skillPath of skillsToRemove) {
    try {
      fs.removeSync(skillPath);
      removedSkillPaths.push(skillPath);
      quiet(ctx, () => successMsg(`Removed skill: ${path.basename(skillPath)} (${path.dirname(skillPath)})`));
    } catch (err) {
      quiet(ctx, () => errorMsg(`Failed to remove ${skillPath}: ${err.message}`));
    }
  }
  pruneSkillsLocks(removedSkillPaths);

  if (deleteBackups) {
    for (const backupPath of foundBackups) {
      try {
        fs.removeSync(backupPath);
      } catch { /* best-effort */ }
    }
    quiet(ctx, () => successMsg(`Deleted ${foundBackups.length} backup file(s)`));
  }

  // Prune the manifest so `list`/`status` reflect what was just removed —
  // otherwise removed servers/skills linger forever as phantom drift.
  pruneSystemManifest(mcpToRemove, skillsToRemove);

  return report;
}

// Remove cleaned-up entries from the system manifest. `mcpToRemove` is
// { [agentId]: [serverId] }; `skillPaths` are the removed skill directories;
// `skillIds` are skills to drop outright (nothing left on disk for them).
function pruneSystemManifest(mcpToRemove, skillPaths, skillIds = []) {
  if (!fs.existsSync(SYSTEM_MANIFEST_PATH)) return;
  for (const [agentId, serverIds] of Object.entries(mcpToRemove)) {
    unrecordMcp(SYSTEM_MANIFEST_PATH, agentId, serverIds);
  }

  const m = readManifest(SYSTEM_MANIFEST_PATH);
  let changed = false;
  const drop = (key) => { if (m.skills[key]) { delete m.skills[key]; changed = true; } };
  for (const skillPath of skillPaths) {
    const skillId = path.basename(skillPath);
    const entry = m.skills[skillId];
    if (entry) {
      // Forget just this directory; the id stays while another copy remains.
      const remaining = manifestSkillDirs(entry, skillId).filter((d) => d !== skillPath && fs.existsSync(path.join(d, 'SKILL.md')));
      if (remaining.length === 0) drop(skillId);
      else { m.skills[skillId] = { ...entry, dirs: remaining, path: path.dirname(remaining[0]) }; changed = true; }
    }
    // Legacy manifests may still key skills by display name.
    const skill = SKILLS.find((s) => s.id === skillId);
    if (skill?.name) drop(skill.name);
  }
  for (const id of skillIds) drop(id);

  if (changed) writeManifest(SYSTEM_MANIFEST_PATH, m);
}

// ── Project Cleanup ──

// ctx: { nonInteractive, dryRun, json }
async function runProjectCleanup(ctx) {
  const { nonInteractive, dryRun } = ctx;
  const cwd = process.cwd();

  quiet(ctx, () => sectionHeader('Project Cleanup — Scanning'));

  const spinner = startSpinner(ctx, 'Scanning project files...');

  const foundFiles = scanProjectFiles(cwd);

  // Skills recorded by a project-mode run live in this project's manifest. A
  // checked-out `.dxai/manifest.json` is repo content, so only directories
  // inside the project are ever candidates — never a path it points elsewhere.
  const projectManifest = readManifest(path.join(cwd, PROJECT_MANIFEST_PATH));
  const foundSkills = findManifestSkills(projectManifest)
    .filter((s) => isInside(cwd, s.path))
    .map((s) => ({ ...s, path: realPath(s.path) }));

  const projectMcpFindings = [];
  for (const agent of AGENT_DEFINITIONS) {
    if (!agent.projectMcpPath) continue;
    const projectConfigPath = path.join(cwd, agent.projectMcpPath());
    if (!fs.existsSync(projectConfigPath)) continue;

    const foundServers = (agent.projectConfigFormat || agent.configFormat) === 'toml'
      ? scanTomlMcpConfig(projectConfigPath, KNOWN_MCP_IDS)
      : scanJsonMcpConfig(projectConfigPath, agent.projectMcpKey || agent.mcpKey, KNOWN_MCP_IDS);
    if (foundServers.length > 0) {
      projectMcpFindings.push({ agent, configPath: projectConfigPath, foundServers });
    }
  }

  spinner?.stop();

  if (foundFiles.length === 0 && projectMcpFindings.length === 0 && foundSkills.length === 0) {
    quiet(ctx, () => infoMsg('No dxai-managed project files found in current directory.'));
    return { files: [], skippedFiles: [], mcp: {}, skills: [] };
  }

  // Select project files to remove. Non-interactive mirrors the interactive
  // defaults: files that may carry custom edits (CLAUDE.md, AGENTS.md, ...) are
  // NOT removed automatically — they're reported as skipped instead.
  let filesToRemove = [];
  let skippedFiles = [];
  if (foundFiles.length > 0) {
    if (nonInteractive) {
      filesToRemove = foundFiles.filter((f) => !f.mayHaveCustomEdits).map((f) => f.absolutePath);
      skippedFiles = foundFiles.filter((f) => f.mayHaveCustomEdits).map((f) => f.relativePath);
    } else {
      console.log();
      sectionHeader('Project Files Found');

      const fileChoices = foundFiles.map((f) => {
        const label = f.mayHaveCustomEdits
          ? `${f.relativePath} (may contain custom edits)`
          : f.relativePath;
        return { name: label, value: f.absolutePath, checked: !f.mayHaveCustomEdits };
      });

      console.log();
      const { selectedFiles } = await prompt([
        {
          type: 'checkbox',
          name: 'selectedFiles',
          message: 'Select project files to remove:',
          choices: fileChoices,
          pageSize: 20,
          loop: false,
        },
      ]);
      filesToRemove = selectedFiles;
    }
  }

  // Select project MCP servers to remove — everything found when non-interactive.
  let projectMcpToRemove = {};
  if (projectMcpFindings.length > 0) {
    if (nonInteractive) {
      for (const finding of projectMcpFindings) {
        projectMcpToRemove[finding.agent.id] = [...finding.foundServers];
      }
    } else {
      console.log();
      sectionHeader('Project MCP Servers Found');

      const mcpChoices = [];
      for (const finding of projectMcpFindings) {
        mcpChoices.push(new inquirer.Separator(chalk.cyan(`\n  ${finding.agent.name}`) + chalk.dim(` — ${finding.configPath}`)));
        for (const serverId of finding.foundServers) {
          const server = MCP_SERVERS.find((s) => s.id === serverId);
          const label = server ? server.name : serverId;
          mcpChoices.push({
            name: `${label}`,
            value: `${finding.agent.id}::${serverId}`,
            checked: true,
          });
        }
      }

      console.log();
      const { selectedProjectMcp } = await prompt([
        {
          type: 'checkbox',
          name: 'selectedProjectMcp',
          message: 'Select project MCP servers to remove:',
          choices: mcpChoices,
          pageSize: 25,
          loop: false,
        },
      ]);

      projectMcpToRemove = groupPicks(selectedProjectMcp);
    }
  }

  // Project-installed skills — everything found when non-interactive.
  let skillsToRemove = [];
  if (foundSkills.length > 0) {
    if (nonInteractive) {
      skillsToRemove = foundSkills.map((s) => s.path);
    } else {
      console.log();
      sectionHeader('Installed Skills Found');
      console.log();
      const { selectedSkills } = await prompt([
        {
          type: 'checkbox',
          name: 'selectedSkills',
          message: 'Select skills to remove:',
          choices: foundSkills.map((s) => ({ name: `${s.id} (${path.relative(cwd, s.path)})`, value: s.path, checked: true })),
          pageSize: 20,
          loop: false,
        },
      ]);
      skillsToRemove = selectedSkills;
    }
  }

  const projectMcpCount = countIds(projectMcpToRemove);
  if (filesToRemove.length === 0 && projectMcpCount === 0 && skillsToRemove.length === 0) {
    quiet(ctx, () => infoMsg('Nothing selected for removal.'));
    return { files: [], skippedFiles, mcp: {}, skills: [] };
  }

  // Summary & confirm (interactive only)
  quiet(ctx, () => {
    console.log();
    sectionHeader(dryRun ? 'Cleanup Summary (dry run)' : 'Cleanup Summary');
    if (filesToRemove.length > 0) infoMsg(`Files to remove: ${filesToRemove.length}`);
    if (skippedFiles.length > 0) infoMsg(`Skipped (may contain custom edits): ${skippedFiles.join(', ')}`);
    if (projectMcpCount > 0) infoMsg(`Project MCP servers to remove: ${projectMcpCount}`);
    if (skillsToRemove.length > 0) infoMsg(`Skills to remove: ${skillsToRemove.length}`);
  });

  if (!nonInteractive && !dryRun) {
    console.log();
    if (!(await confirm('Proceed with cleanup?', { defaultValue: false }))) {
      warnMsg('Cleanup cancelled.');
      return { files: [], skippedFiles, mcp: {}, cancelled: true };
    }
  }

  const report = {
    files: filesToRemove.map((f) => path.relative(cwd, f)),
    skippedFiles,
    mcp: projectMcpToRemove,
    skills: skillsToRemove.map((s) => path.relative(cwd, s)),
  };

  // Execute (skipped entirely on --dry-run)
  if (dryRun) return report;

  quiet(ctx, () => {
    console.log();
    sectionHeader('Removing');
  });

  for (const filePath of filesToRemove) {
    try {
      fs.removeSync(filePath);
      quiet(ctx, () => successMsg(`Removed: ${path.relative(cwd, filePath)}`));
    } catch (err) {
      quiet(ctx, () => errorMsg(`Failed to remove ${path.relative(cwd, filePath)}: ${err.message}`));
    }
  }

  const removedSkillPaths = [];
  for (const skillPath of skillsToRemove) {
    try {
      fs.removeSync(skillPath);
      removedSkillPaths.push(skillPath);
      quiet(ctx, () => successMsg(`Removed skill: ${path.relative(cwd, skillPath)}`));
    } catch (err) {
      quiet(ctx, () => errorMsg(`Failed to remove ${skillPath}: ${err.message}`));
    }
  }
  pruneSkillsLocks(removedSkillPaths);

  for (const [agentId, serverIds] of Object.entries(projectMcpToRemove)) {
    const agent = AGENT_DEFINITIONS.find((a) => a.id === agentId);
    if (!agent) continue;

    const projectConfigPath = path.join(cwd, agent.projectMcpPath());
    try {
      // A project config dxai emptied out is deleted rather than left as `{}`.
      const { removed, deletedFile } = (agent.projectConfigFormat || agent.configFormat) === 'toml'
        ? removeTomlMcpServers(projectConfigPath, serverIds, { removeIfEmpty: true })
        : removeJsonMcpServers(projectConfigPath, agent.projectMcpKey || agent.mcpKey, serverIds, { removeIfEmpty: true });
      quiet(ctx, () => successMsg(`Removed ${removed} server(s) from project ${agent.name} config${deletedFile ? ' (file removed, nothing left in it)' : ''}`));
    } catch (err) {
      quiet(ctx, () => errorMsg(`Failed to clean project ${agent.name} config: ${err.message}`));
    }
  }

  const dirsToCheck = [
    path.join(cwd, '.cursor', 'rules'),
    path.join(cwd, '.cursor', 'commands'),
    ...Object.keys(CURSOR_COMMANDS).map((name) => path.join(cwd, '.cursor', 'skills', name)),
    path.join(cwd, '.cursor', 'skills'),
    path.join(cwd, '.cursor'),
    path.join(cwd, '.vscode'),
    path.join(cwd, '.gemini'),
    path.join(cwd, '.codex'),
    path.join(cwd, '.devin'),
    path.join(cwd, '.agents', 'skills'),
    path.join(cwd, '.agents'),
    path.join(cwd, '.claude', 'skills'),
    path.join(cwd, '.claude'),
  ];

  for (const dir of dirsToCheck) {
    if (isEmptyDir(dir)) {
      try {
        fs.removeSync(dir);
      } catch { /* best-effort */ }
    }
  }

  // Prune the project manifest for the files, MCP servers and skills we removed.
  pruneProjectManifest(cwd, filesToRemove, projectMcpToRemove);

  return report;
}

// True when `child` is `parent` or lives underneath it, comparing real paths so
// neither `..` segments nor a symlinked parent (macOS /var → /private/var) can
// make a directory look like it is somewhere it is not.
function realPath(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}
function isInside(parent, child) {
  const rel = path.relative(realPath(parent), realPath(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Drop removed files/servers from the project manifest, plus anything it still
// records that is no longer on disk (removed by hand, or by a rollback).
function pruneProjectManifest(cwd, filePaths, projectMcpToRemove) {
  const manifestPath = path.join(cwd, PROJECT_MANIFEST_PATH);
  if (!fs.existsSync(manifestPath)) return;

  for (const [agentId, serverIds] of Object.entries(projectMcpToRemove)) {
    unrecordMcp(manifestPath, agentId, serverIds);
  }

  const m = readManifest(manifestPath);
  let changed = false;
  const removedRel = new Set(filePaths.map((f) => path.relative(cwd, f)));
  const files = m.files.filter((f) => !removedRel.has(f.relativePath) && fs.existsSync(path.join(cwd, f.relativePath)));
  if (files.length !== m.files.length) { m.files = files; changed = true; }

  for (const [agentId, servers] of Object.entries(m.mcp)) {
    const agent = AGENT_DEFINITIONS.find((a) => a.id === agentId);
    if (!agent?.projectMcpPath) continue;
    const p = path.join(cwd, agent.projectMcpPath());
    const live = (agent.projectConfigFormat || agent.configFormat) === 'toml'
      ? scanTomlMcpConfig(p, Object.keys(servers))
      : scanJsonMcpConfig(p, agent.projectMcpKey || agent.mcpKey, Object.keys(servers));
    for (const id of Object.keys(servers)) {
      if (!live.includes(id)) { delete servers[id]; changed = true; }
    }
    if (Object.keys(servers).length === 0) { delete m.mcp[agentId]; changed = true; }
  }
  for (const [id, entry] of Object.entries(m.skills || {})) {
    const remaining = manifestSkillDirs(entry, id).filter((d) => fs.existsSync(path.join(d, 'SKILL.md')));
    if (remaining.length === 0) { delete m.skills[id]; changed = true; }
    else if (remaining.length !== manifestSkillDirs(entry, id).length) {
      m.skills[id] = { ...entry, dirs: remaining, path: path.dirname(remaining[0]) };
      changed = true;
    }
  }
  if (changed) writeManifest(manifestPath, m);
}

// ── Main Cleanup Entry Point ──

const CLEANUP_SCOPES = ['system', 'project', 'both'];

// `dxai cleanup [scope]` — interactive by default; --yes/--json run without
// prompts (removing everything dxai-managed except custom-edit-prone files and
// backups), --dry-run reports without touching anything.
export async function cleanup(scopeArg, opts = {}) {
  const runtime = normalizeOptions(opts);
  const json = runtime.json;
  const nonInteractive = runtime.nonInteractive || json;
  const dryRun = runtime.dryRun;
  const ctx = { nonInteractive, dryRun, json, includeBackups: !!opts.backups };

  let scope = scopeArg;
  if (scope && !CLEANUP_SCOPES.includes(scope)) {
    throw new Error(`Unknown cleanup scope: ${scope}. Known: ${CLEANUP_SCOPES.join(', ')}`);
  }

  if (!json) {
    printBanner();
    sectionHeader(dryRun ? 'Cleanup (dry run)' : 'Cleanup');
    console.log();
  }

  if (!scope) {
    if (nonInteractive) {
      scope = 'both';
    } else {
      const { picked } = await prompt([
        {
          type: 'list',
          name: 'picked',
          message: 'What would you like to clean up?',
          choices: [
            { name: 'System — global MCP configs, skills, backups', value: 'system' },
            { name: 'Project — project files, rules, commands', value: 'project' },
            { name: 'Both — system and project', value: 'both' },
          ],
        },
      ]);
      scope = picked;
    }
  }

  const { home } = detectOS();
  const report = { ok: true, dryRun, scope, system: null, project: null };

  if (scope === 'system' || scope === 'both') {
    report.system = await runSystemCleanup(home, ctx);
  }

  if (scope === 'project' || scope === 'both') {
    report.project = await runProjectCleanup(ctx);
  }

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report;
  }

  console.log();
  if (dryRun) warnMsg('Dry run — no files were changed.');
  else successMsg('Cleanup complete.');
  console.log();
  return report;
}
