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
  scanBackupFiles, scanSkillDirectories,
  scanProjectFiles, isEmptyDir,
} from './config-remover.js';
import { normalizeOptions } from './runtime.js';
import { confirm } from './select.js';
import { readManifest, SYSTEM_MANIFEST_PATH, PROJECT_MANIFEST_PATH, writeManifest, unrecordMcp } from './manifest.js';

const KNOWN_MCP_IDS = MCP_SERVERS.map((s) => s.id);
const KNOWN_SKILL_IDS = SKILLS.map((s) => s.id);

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

function candidateSkillIds(manifest) {
  const fromManifest = Object.keys(manifest.skills || {});
  return fromManifest.length > 0 ? fromManifest : KNOWN_SKILL_IDS;
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

  const skillIds = candidateSkillIds(manifest);
  const skillBaseDirs = [
    path.join(home, '.cursor', 'skills'),
    path.join(home, '.agents', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(process.cwd(), '.cursor', 'skills'),
    path.join(process.cwd(), '.agents', 'skills'),
    path.join(process.cwd(), '.claude', 'skills'),
  ];
  const foundSkills = scanSkillDirectories(skillBaseDirs, skillIds);

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
      const { selectedMcp } = await inquirer.prompt([
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
      const { selectedSkills } = await inquirer.prompt([
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

  for (const skillPath of skillsToRemove) {
    try {
      fs.removeSync(skillPath);
      quiet(ctx, () => successMsg(`Removed skill: ${path.basename(skillPath)}`));
    } catch (err) {
      quiet(ctx, () => errorMsg(`Failed to remove ${skillPath}: ${err.message}`));
    }
  }

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
// { [agentId]: [serverId] }; `skillPaths` are the removed skill directories.
function pruneSystemManifest(mcpToRemove, skillPaths) {
  for (const [agentId, serverIds] of Object.entries(mcpToRemove)) {
    unrecordMcp(SYSTEM_MANIFEST_PATH, agentId, serverIds);
  }

  const m = readManifest(SYSTEM_MANIFEST_PATH);
  let changed = false;
  for (const skillPath of skillPaths) {
    const skillId = path.basename(skillPath);
    const skill = SKILLS.find((s) => s.id === skillId);
    // Skills are recorded by id (recordSystemSkills); legacy manifests may
    // still key them by display name, so try both.
    for (const key of [skillId, skill?.name].filter(Boolean)) {
      if (m.skills[key]) { delete m.skills[key]; changed = true; }
    }
  }

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

  if (foundFiles.length === 0 && projectMcpFindings.length === 0) {
    quiet(ctx, () => infoMsg('No dxai-managed project files found in current directory.'));
    return { files: [], skippedFiles: [], mcp: {} };
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
      const { selectedFiles } = await inquirer.prompt([
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
      const { selectedProjectMcp } = await inquirer.prompt([
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

  const projectMcpCount = countIds(projectMcpToRemove);
  if (filesToRemove.length === 0 && projectMcpCount === 0) {
    quiet(ctx, () => infoMsg('Nothing selected for removal.'));
    return { files: [], skippedFiles, mcp: {} };
  }

  // Summary & confirm (interactive only)
  quiet(ctx, () => {
    console.log();
    sectionHeader(dryRun ? 'Cleanup Summary (dry run)' : 'Cleanup Summary');
    if (filesToRemove.length > 0) infoMsg(`Files to remove: ${filesToRemove.length}`);
    if (skippedFiles.length > 0) infoMsg(`Skipped (may contain custom edits): ${skippedFiles.join(', ')}`);
    if (projectMcpCount > 0) infoMsg(`Project MCP servers to remove: ${projectMcpCount}`);
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

  for (const [agentId, serverIds] of Object.entries(projectMcpToRemove)) {
    const agent = AGENT_DEFINITIONS.find((a) => a.id === agentId);
    if (!agent) continue;

    const projectConfigPath = path.join(cwd, agent.projectMcpPath());
    try {
      const { removed } = (agent.projectConfigFormat || agent.configFormat) === 'toml'
        ? removeTomlMcpServers(projectConfigPath, serverIds)
        : removeJsonMcpServers(projectConfigPath, agent.projectMcpKey || agent.mcpKey, serverIds);
      quiet(ctx, () => successMsg(`Removed ${removed} server(s) from project ${agent.name} config`));
    } catch (err) {
      quiet(ctx, () => errorMsg(`Failed to clean project ${agent.name} config: ${err.message}`));
    }
  }

  const dirsToCheck = [
    path.join(cwd, '.cursor', 'rules'),
    path.join(cwd, '.cursor', 'commands'),
    path.join(cwd, '.cursor'),
    path.join(cwd, '.vscode'),
    path.join(cwd, '.gemini'),
  ];

  for (const dir of dirsToCheck) {
    if (isEmptyDir(dir)) {
      try {
        fs.removeSync(dir);
      } catch { /* best-effort */ }
    }
  }

  // Prune the project manifest for the files and MCP servers we removed.
  pruneProjectManifest(cwd, filesToRemove, projectMcpToRemove);

  return report;
}

function pruneProjectManifest(cwd, filePaths, projectMcpToRemove) {
  const manifestPath = path.join(cwd, PROJECT_MANIFEST_PATH);
  if (!fs.existsSync(manifestPath)) return;

  for (const [agentId, serverIds] of Object.entries(projectMcpToRemove)) {
    unrecordMcp(manifestPath, agentId, serverIds);
  }

  if (filePaths.length === 0) return;
  const m = readManifest(manifestPath);
  const removedRel = new Set(filePaths.map((f) => path.relative(cwd, f)));
  const before = m.files.length;
  m.files = m.files.filter((f) => !removedRel.has(f.relativePath));
  if (m.files.length !== before) writeManifest(manifestPath, m);
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
      const { picked } = await inquirer.prompt([
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
