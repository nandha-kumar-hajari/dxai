import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

import {
  printBanner, sectionHeader, successMsg, warnMsg,
  errorMsg, infoMsg, theme,
} from './branding.js';
import { detectOS, AGENT_DEFINITIONS } from './detect.js';
import { MCP_SERVERS } from './registry/mcp-servers.js';
import { SKILLS } from './registry/skills.js';
import { TECH_STACKS, CURSOR_COMMANDS } from './registry/stacks.js';
import {
  scanJsonMcpConfig, removeJsonMcpServers,
  scanTomlMcpConfig, removeTomlMcpServers,
  scanClaudeCodeMcpServers, removeClaudeCodeMcpServers,
  scanBackupFiles, scanSkillDirectories,
  scanProjectFiles, isEmptyDir,
} from './config-remover.js';

import { readManifest, SYSTEM_MANIFEST_PATH, PROJECT_MANIFEST_PATH, writeManifest } from './manifest.js';

const KNOWN_MCP_IDS = MCP_SERVERS.map((s) => s.id);
const KNOWN_SKILL_IDS = SKILLS.map((s) => s.id);

// Build the candidate ID list for scanning. If the manifest has entries,
// prefer it (precise — we only target what dxai installed). Otherwise fall
// back to the full known set (legacy behavior for installs predating manifest).
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

// ══════════════════════════════════════════════
// System Cleanup
// ══════════════════════════════════════════════

async function runSystemCleanup(home) {
  sectionHeader('System Cleanup — Scanning');

  const spinner = ora({ text: 'Scanning global configs...', color: 'cyan' }).start();
  const manifest = readManifest(SYSTEM_MANIFEST_PATH);

  // 1. Scan MCP servers across all agents — prefer manifest IDs when present
  const agentFindings = [];
  for (const agent of AGENT_DEFINITIONS) {
    const finding = { agent, foundServers: [] };
    const ids = candidateMcpIds(manifest, agent.id);

    switch (agent.configFormat) {
      case 'json': {
        const configPath = agent.globalMcpPath(home);
        finding.foundServers = scanJsonMcpConfig(configPath, agent.mcpKey, ids);
        finding.configPath = configPath;
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

  // 2. Scan skills directories
  const skillIds = candidateSkillIds(manifest);
  const skillBaseDirs = [
    path.join(home, '.cursor', 'skills'),
    path.join(home, '.agents', 'skills'),
    path.join(process.cwd(), '.cursor', 'skills'),
    path.join(process.cwd(), '.agents', 'skills'),
  ];
  const foundSkills = scanSkillDirectories(skillBaseDirs, skillIds);

  // 3. Scan backup files (only for file-based agents — CLI agents don't write backups,
  // and their globalMcpPath sits in $HOME which would surface unrelated .bak files)
  const backupTargets = AGENT_DEFINITIONS
    .filter((a) => a.configFormat !== 'cli')
    .map((a) => {
      try { return a.globalMcpPath(home); } catch { return null; }
    })
    .filter(Boolean);
  const foundBackups = scanBackupFiles(backupTargets);

  spinner.stop();

  // Check if anything was found
  const totalMcpServers = agentFindings.reduce((sum, f) => sum + f.foundServers.length, 0);
  if (totalMcpServers === 0 && foundSkills.length === 0 && foundBackups.length === 0) {
    infoMsg('No dxai-managed system configurations found.');
    return;
  }

  // 4. Prompt: MCP servers to remove
  let mcpToRemove = {};
  if (totalMcpServers > 0) {
    console.log();
    sectionHeader('MCP Servers Found');

    // Build unified choices grouped by agent
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

    // Parse selections into { agentId: [serverIds] }
    for (const sel of selectedMcp) {
      const [agentId, serverId] = sel.split('::');
      if (!mcpToRemove[agentId]) mcpToRemove[agentId] = [];
      mcpToRemove[agentId].push(serverId);
    }
  }

  // 5. Prompt: Skills to remove
  let skillsToRemove = [];
  if (foundSkills.length > 0) {
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

  // 6. Prompt: Backup files
  let deleteBackups = false;
  if (foundBackups.length > 0) {
    console.log();
    const { confirmBackups } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmBackups',
        message: `Delete ${foundBackups.length} backup file(s)?`,
        default: false,
      },
    ]);
    deleteBackups = confirmBackups;
  }

  // Check if anything was selected
  const mcpCount = Object.values(mcpToRemove).reduce((sum, ids) => sum + ids.length, 0);
  if (mcpCount === 0 && skillsToRemove.length === 0 && !deleteBackups) {
    infoMsg('Nothing selected for removal.');
    return;
  }

  // 7. Summary & confirm
  console.log();
  sectionHeader('Cleanup Summary');
  if (mcpCount > 0) infoMsg(`MCP servers to remove: ${mcpCount}`);
  if (skillsToRemove.length > 0) infoMsg(`Skills to remove: ${skillsToRemove.length}`);
  if (deleteBackups) infoMsg(`Backup files to delete: ${foundBackups.length}`);

  console.log();
  const { confirmCleanup } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmCleanup',
      message: 'Proceed with cleanup?',
      default: false,
    },
  ]);

  if (!confirmCleanup) {
    warnMsg('Cleanup cancelled.');
    return;
  }

  // 8. Execute
  console.log();
  sectionHeader('Removing');

  // Remove MCP servers
  for (const [agentId, serverIds] of Object.entries(mcpToRemove)) {
    const agent = AGENT_DEFINITIONS.find((a) => a.id === agentId);
    if (!agent) continue;

    const spin = ora({ text: `Removing from ${agent.name}...`, color: 'cyan' }).start();

    try {
      switch (agent.configFormat) {
        case 'json': {
          const configPath = agent.globalMcpPath(home);
          const { removed } = removeJsonMcpServers(configPath, agent.mcpKey, serverIds);
          spin.stop();
          successMsg(`Removed ${removed} server(s) from ${agent.name}`);
          break;
        }
        case 'toml': {
          const configPath = agent.globalMcpPath(home);
          const { removed } = removeTomlMcpServers(configPath, serverIds);
          spin.stop();
          successMsg(`Removed ${removed} server(s) from ${agent.name}`);
          break;
        }
        case 'cli': {
          const { removed, errors } = removeClaudeCodeMcpServers(serverIds);
          spin.stop();
          successMsg(`Removed ${removed} server(s) from ${agent.name}`);
          for (const err of errors) {
            warnMsg(`Failed to remove "${err.id}": ${err.error}`);
          }
          break;
        }
      }
    } catch (err) {
      spin.stop();
      errorMsg(`Failed to clean ${agent.name}: ${err.message}`);
    }
  }

  // Remove skills
  for (const skillPath of skillsToRemove) {
    try {
      fs.removeSync(skillPath);
      successMsg(`Removed skill: ${path.basename(skillPath)}`);
    } catch (err) {
      errorMsg(`Failed to remove ${skillPath}: ${err.message}`);
    }
  }

  // Remove backup files
  if (deleteBackups) {
    for (const backupPath of foundBackups) {
      try {
        fs.removeSync(backupPath);
      } catch {
        // Skip individual backup errors
      }
    }
    successMsg(`Deleted ${foundBackups.length} backup file(s)`);
  }
}

// ══════════════════════════════════════════════
// Project Cleanup
// ══════════════════════════════════════════════

async function runProjectCleanup() {
  const cwd = process.cwd();

  sectionHeader('Project Cleanup — Scanning');

  const spinner = ora({ text: 'Scanning project files...', color: 'cyan' }).start();

  // 1. Scan project files
  const foundFiles = scanProjectFiles(cwd);

  // 2. Scan project-level MCP configs
  const projectMcpFindings = [];
  for (const agent of AGENT_DEFINITIONS) {
    if (!agent.projectMcpPath) continue;
    const projectConfigPath = path.join(cwd, agent.projectMcpPath());
    if (!fs.existsSync(projectConfigPath)) continue;

    const foundServers = scanJsonMcpConfig(projectConfigPath, agent.mcpKey, KNOWN_MCP_IDS);
    if (foundServers.length > 0) {
      projectMcpFindings.push({ agent, configPath: projectConfigPath, foundServers });
    }
  }

  spinner.stop();

  if (foundFiles.length === 0 && projectMcpFindings.length === 0) {
    infoMsg('No dxai-managed project files found in current directory.');
    return;
  }

  // 3. Prompt: Project files to remove
  let filesToRemove = [];
  if (foundFiles.length > 0) {
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

  // 4. Prompt: Project MCP servers to remove
  let projectMcpToRemove = {};
  if (projectMcpFindings.length > 0) {
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

    for (const sel of selectedProjectMcp) {
      const [agentId, serverId] = sel.split('::');
      if (!projectMcpToRemove[agentId]) projectMcpToRemove[agentId] = [];
      projectMcpToRemove[agentId].push(serverId);
    }
  }

  // Check if anything selected
  const projectMcpCount = Object.values(projectMcpToRemove).reduce((sum, ids) => sum + ids.length, 0);
  if (filesToRemove.length === 0 && projectMcpCount === 0) {
    infoMsg('Nothing selected for removal.');
    return;
  }

  // 5. Summary & confirm
  console.log();
  sectionHeader('Cleanup Summary');
  if (filesToRemove.length > 0) infoMsg(`Files to remove: ${filesToRemove.length}`);
  if (projectMcpCount > 0) infoMsg(`Project MCP servers to remove: ${projectMcpCount}`);

  console.log();
  const { confirmCleanup } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmCleanup',
      message: 'Proceed with cleanup?',
      default: false,
    },
  ]);

  if (!confirmCleanup) {
    warnMsg('Cleanup cancelled.');
    return;
  }

  // 6. Execute
  console.log();
  sectionHeader('Removing');

  // Remove project files
  for (const filePath of filesToRemove) {
    try {
      fs.removeSync(filePath);
      successMsg(`Removed: ${path.relative(cwd, filePath)}`);
    } catch (err) {
      errorMsg(`Failed to remove ${path.relative(cwd, filePath)}: ${err.message}`);
    }
  }

  // Remove project MCP server entries
  for (const [agentId, serverIds] of Object.entries(projectMcpToRemove)) {
    const agent = AGENT_DEFINITIONS.find((a) => a.id === agentId);
    if (!agent) continue;

    const projectConfigPath = path.join(cwd, agent.projectMcpPath());
    try {
      const { removed } = removeJsonMcpServers(projectConfigPath, agent.mcpKey, serverIds);
      successMsg(`Removed ${removed} server(s) from project ${agent.name} config`);
    } catch (err) {
      errorMsg(`Failed to clean project ${agent.name} config: ${err.message}`);
    }
  }

  // Clean up empty directories
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
      } catch {
        // Skip
      }
    }
  }
}

// ══════════════════════════════════════════════
// Main Cleanup Entry Point
// ══════════════════════════════════════════════

export async function cleanup() {
  printBanner();

  sectionHeader('Cleanup');
  console.log();

  const { scope } = await inquirer.prompt([
    {
      type: 'list',
      name: 'scope',
      message: 'What would you like to clean up?',
      choices: [
        { name: 'System — global MCP configs, skills, backups', value: 'system' },
        { name: 'Project — project files, rules, commands', value: 'project' },
        { name: 'Both — system and project', value: 'both' },
      ],
    },
  ]);

  const { home } = detectOS();

  if (scope === 'system' || scope === 'both') {
    await runSystemCleanup(home);
  }

  if (scope === 'project' || scope === 'both') {
    await runProjectCleanup();
  }

  console.log();
  successMsg('Cleanup complete.');
  console.log();
}
