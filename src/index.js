import { execFileSync } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

import {
  printBanner, sectionHeader, successMsg, warnMsg,
  errorMsg, infoMsg, theme, quiet, startSpinner, reportMcpResults,
} from './branding.js';
import {
  detectOS, checkPrerequisites, detectAgents,
  printDetectionResults, AGENT_DEFINITIONS, INSTALL_COMMANDS,
  detectAutomationTools,
} from './detect.js';
import { MCP_SERVERS, MCP_CATEGORIES } from './registry/mcp-servers.js';
import { SKILLS, SKILL_CATEGORIES } from './registry/skills.js';
import { AUTOMATION_TOOLS, AUTOMATION_TOOL_CATEGORIES } from './registry/automation-tools.js';
import { TECH_STACKS, CURSOR_RULES, CURSOR_COMMANDS } from './registry/stacks.js';
import { detectProject } from './detect-project.js';
import {
  writeMcpConfigs, writeProjectMcpConfigs, writeCursorRules, writeCursorCommands,
  writeCursorIgnore, writeProjectInstructions, installSkills,
  writeGitattributes, writeEditorconfig, writeAgentsMd,
  previewMcpConfigs,
} from './config-writer.js';
import { normalizeOptions } from './runtime.js';
import { resolveSelection, buildCatalogChoices, confirm } from './select.js';
import { parseSafeCommand } from './registry/validate.js';
import { maybeRefreshCatalog } from './auto-update.js';
import { resolveProfile, readProfile, mergeWithProfile, saveProfile, listProfiles } from './profile.js';
import {
  recordSystemMcp, recordSystemSkills, recordSystemTools, recordProjectMcp, recordProjectSkills, recordProjectFiles,
} from './manifest.js';

// Count per-step failures captured inside a flow's result maps, so a partially
// failed setup can exit non-zero instead of silently reporting success.
function countResultErrors({ mcpResults, toolResults, skillResults } = {}) {
  let n = 0;
  for (const r of Object.values(mcpResults || {})) n += (r.errors || []).length;
  n += (toolResults?.errors || []).length;
  n += (skillResults?.errors || []).length;
  return n;
}

// In non-interactive mode, fall back to defaults instead of prompting.
// Exported so the fast-path `dxai add` command can reuse the same input flow.
export async function collectMcpInputs(selectedMcpIds, mcpRegistry, runtime) {
  const inputs = {};
  for (const id of selectedMcpIds) {
    const server = mcpRegistry.find((s) => s.id === id);
    if (!server?.requiresInput) continue;

    if (runtime.nonInteractive) {
      const auto = {};
      for (const [key, def] of Object.entries(server.requiresInput)) {
        if (def.default === undefined || def.default === null) {
          throw new Error(`MCP server "${id}" requires input "${key}" but no default is set; cannot run non-interactively without a value.`);
        }
        auto[key] = def.default;
      }
      inputs[id] = auto;
      continue;
    }

    const questions = Object.entries(server.requiresInput).map(([key, def]) => ({
      type: 'input',
      name: key,
      message: `[${server.name}] ${def.prompt}`,
      default: def.default,
      validate: (v) => (v && v.trim().length > 0) || 'Required.',
    }));
    inputs[id] = await inquirer.prompt(questions);
  }
  return inputs;
}

// ── MCP servers — shared selection (system + project flows) ──
function mcpServersFor(selectedAgentIds) {
  return MCP_SERVERS.filter((s) => selectedAgentIds.some((aid) => s.configs[aid]));
}

function recommendedMcpIds(selectedAgentIds) {
  return mcpServersFor(selectedAgentIds).filter((s) => s.recommended).map((s) => s.id);
}

async function promptMcpServers(selectedAgentIds, message) {
  const choices = buildCatalogChoices(MCP_CATEGORIES, mcpServersFor(selectedAgentIds), {
    decorate: (s) => ({ note: s.requiresEnv ? chalk.dim(' (needs API key)') : '' }),
  });
  const { picked } = await inquirer.prompt([
    { type: 'checkbox', name: 'picked', message, choices, pageSize: 25, loop: false },
  ]);
  return picked;
}

// ── Shared: Banner + Detection + Agent Selection ──
async function sharedSetup(runtime) {
  const osInfo = detectOS();
  const prereqs = checkPrerequisites();
  const agents = detectAgents(osInfo.home);

  quiet(runtime, () => {
    sectionHeader('Environment Detection');
    printDetectionResults(osInfo, prereqs, agents);
  });

  if (!prereqs.node.installed) {
    if (runtime.json) {
      throw new Error('Node.js is required.');
    }
    console.log();
    errorMsg('Node.js is required. Install it from https://nodejs.org');
    process.exit(1);
  }

  // Agent selection — flag, then default to detected, then prompt.
  const selectedAgentIds = await resolveSelection({
    flag: runtime.agents && runtime.agents.length > 0 ? runtime.agents : undefined,
    knownIds: AGENT_DEFINITIONS.map((a) => a.id),
    label: 'agent ID',
    requireNonEmpty: true,
    nonInteractive: runtime.nonInteractive,
    defaults: () => {
      const detected = agents.filter((a) => a.installed).map((a) => a.id);
      if (detected.length === 0) {
        throw new Error('No agents detected. Pass --agents to choose explicitly.');
      }
      return detected;
    },
    prompt: async () => {
      console.log();
      sectionHeader('Select Your AI Tools');
      console.log();

      const agentChoices = AGENT_DEFINITIONS.map((def) => {
        const detected = agents.find((a) => a.id === def.id);
        const status = detected?.installed ? chalk.green(' (detected)') : '';
        const notice = def.notice ? chalk.yellow(` ⚠ ${def.notice}`) : '';
        return {
          name: `${def.name}${status} — ${def.description}${notice}`,
          value: def.id,
          checked: detected?.installed || false,
        };
      });

      const { picked } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'picked',
          message: 'Which AI tools do you use? (Space to toggle, Enter to confirm)',
          choices: agentChoices,
          loop: false,
          validate: (ans) => ans.length > 0 || 'Please select at least one tool.',
        },
      ]);
      return picked;
    },
  });

  const selectedAgents = AGENT_DEFINITIONS.filter((a) => selectedAgentIds.includes(a.id));

  // Offer install commands for missing agents — interactive only.
  if (!runtime.nonInteractive) {
    const missingAgents = selectedAgents.filter((def) => {
      const detected = agents.find((a) => a.id === def.id);
      return !detected?.installed;
    });

    if (missingAgents.length > 0) {
      console.log();
      warnMsg(`Not installed: ${missingAgents.map((a) => a.name).join(', ')}`);

      if (await confirm('Would you like install commands for the missing tools?')) {
        for (const agent of missingAgents) {
          const cmd = INSTALL_COMMANDS[agent.id]?.[osInfo.name] || 'See official documentation';
          console.log(theme.dim(`    ${agent.name}: `) + theme.accent(cmd));
        }
        console.log();
        infoMsg('Install them and re-run dxai, or continue to configure anyway.');

        if (!(await confirm('Continue with setup for selected tools?'))) {
          console.log();
          infoMsg('Run npx dxai-cli again after installing your tools. Bye!');
          process.exit(0);
        }
      }
    }
  }

  return { osInfo, prereqs, agents, selectedAgents, selectedAgentIds };
}

// ── Skills — shared selection + install (used by system and project modes) ──
// Skills are downloaded into a project-level directory (.agents/skills, read
// natively by Codex, Cursor, Devin and Antigravity; mirrored to .claude/skills
// for Claude Code), so they're meaningful in both the system and project flows. These helpers keep the two call sites consistent.
async function selectSkills(runtime, headerLabel, { recommendByDefault = true } = {}) {
  return resolveSelection({
    flag: runtime.skills,
    knownIds: SKILLS.map((s) => s.id),
    label: 'skill ID',
    nonInteractive: runtime.nonInteractive,
    // No explicit --skills: system mode seeds the recommended set; project mode
    // stays empty so `dxai project --yes` doesn't trigger unexpected downloads.
    defaults: () => (recommendByDefault ? SKILLS.filter((s) => s.recommended).map((s) => s.id) : []),
    prompt: async () => {
      quiet(runtime, () => {
        console.log();
        sectionHeader(headerLabel);
        console.log();
        infoMsg('Skills are downloaded into this project\'s .agents/skills folder (mirrored to .claude/skills for Claude Code)');
        console.log();
      });

      const skillChoices = buildCatalogChoices(SKILL_CATEGORIES, SKILLS);
      const { picked } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'picked',
          message: 'Select agent skills to install:',
          choices: skillChoices,
          pageSize: 20,
          loop: false,
        },
      ]);
      return picked;
    },
  });
}

// Install the chosen skills and report results. `record` persists them to the
// appropriate manifest (system vs project). Mutates `result.skillResults`.
async function installAndReportSkills(selectedSkillIds, selectedAgents, runtime, result, record) {
  if (selectedSkillIds.length === 0) return;
  const spinner = startSpinner(runtime, 'Installing agent skills...');
  try {
    const skillResults = await installSkills(selectedSkillIds, SKILLS, selectedAgents);
    spinner?.stop();
    result.skillResults = skillResults;
    record(skillResults);

    quiet(runtime, () => {
      if (skillResults.installed.length > 0) {
        successMsg(`Skills installed: ${skillResults.installed.join(', ')}`);
        infoMsg(`Skills directory: ${skillResults.directory}`);
      }
      for (const err of skillResults.errors) {
        warnMsg(`Skill "${err.name}": ${err.error}`);
      }
    });
  } catch (err) {
    spinner?.stop();
    result.errorCount = (result.errorCount || 0) + 1;
    if (runtime.json) throw err;
    errorMsg(`Skills installation failed: ${err.message}`);
  }
}

// ── System Mode — global/user-level configs ──
async function runSystem(ctx, runtime) {
  const { osInfo, selectedAgents, selectedAgentIds } = ctx;

  // ── MCP Server Selection ──
  const selectedMcpIds = await resolveSelection({
    flag: runtime.mcp,
    knownIds: MCP_SERVERS.map((s) => s.id),
    label: 'MCP server ID',
    nonInteractive: runtime.nonInteractive,
    defaults: () => recommendedMcpIds(selectedAgentIds),
    prompt: async () => {
      quiet(runtime, () => {
        console.log();
        sectionHeader('Select MCP Servers (Global)');
        console.log();
        infoMsg('★ = recommended  •  Servers are configured globally for all your selected tools');
        console.log();
      });
      return promptMcpServers(selectedAgentIds, 'Select MCP servers to install globally:');
    },
  });

  // ── Suggested Automation Tools ──
  const selectedToolIds = await resolveSelection({
    flag: runtime.tools,
    knownIds: AUTOMATION_TOOLS.map((t) => t.id),
    label: 'automation tool ID',
    nonInteractive: runtime.nonInteractive,
    defaults: () => AUTOMATION_TOOLS.filter((t) => t.recommended).map((t) => t.id),
    prompt: async () => {
      const detectedTools = detectAutomationTools(AUTOMATION_TOOLS);

      quiet(runtime, () => {
        console.log();
        sectionHeader('Suggested Automation Tools');
        console.log();
        infoMsg('★ = suggested  •  Standalone CLIs that give your AI agents browser & device control');
        console.log();
      });

      const toolChoices = buildCatalogChoices(AUTOMATION_TOOL_CATEGORIES, detectedTools, {
        decorate: (t) => ({ status: t.installed ? chalk.green(' (detected)') : '' }),
      });

      const { picked } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'picked',
          message: 'Select automation tools to install:',
          choices: toolChoices,
          loop: false,
        },
      ]);
      return picked;
    },
  });

  // ── Agent Skills Selection ──
  // Note: skills always land in the *current project's* skills folder (that's
  // where the agents read them from) — the header says so rather than "Global".
  const selectedSkillIds = await selectSkills(runtime, 'Select Agent Skills');

  const mcpInputs = await collectMcpInputs(selectedMcpIds, MCP_SERVERS, runtime);

  // ── Summary & Confirmation ──
  quiet(runtime, () => {
    console.log();
    sectionHeader('System Setup Summary');
    console.log();
    console.log(theme.label('  Tools:     ') + selectedAgents.map((a) => a.name).join(', '));
    console.log(theme.label('  MCP:       ') + (selectedMcpIds.length > 0 ? selectedMcpIds.join(', ') : 'none'));
    console.log(theme.label('  Automation: ') + (selectedToolIds.length > 0 ? selectedToolIds.join(', ') : 'none'));
    console.log(theme.label('  Skills:    ') + (selectedSkillIds.length > 0 ? selectedSkillIds.join(', ') : 'none'));
    console.log();
  });

  if (!runtime.nonInteractive && !(await confirm('Proceed with system setup?'))) {
    infoMsg('Setup cancelled. Run npx dxai-cli again anytime.');
    process.exit(0);
  }

  // ── Dry-run short-circuit ──
  if (runtime.dryRun) {
    const previews = selectedMcpIds.length > 0
      ? previewMcpConfigs(selectedAgents, selectedMcpIds, MCP_SERVERS, mcpInputs)
      : {};

    quiet(runtime, () => {
      sectionHeader('Dry run — no changes written');
      console.log();
      for (const p of Object.values(previews)) {
        const tag = p.exists ? theme.dim('(merge)') : theme.dim('(create)');
        console.log(`  ${theme.label(p.agent)} ${tag} → ${p.path}`);
        if (p.wouldAdd.length) console.log(`    ${theme.success('+ would add:')} ${p.wouldAdd.join(', ')}`);
        if (p.wouldSkip.length) console.log(`    ${theme.dim('· already present:')} ${p.wouldSkip.join(', ')}`);
      }
      if (selectedToolIds.length > 0) {
        const detectedTools = detectAutomationTools(AUTOMATION_TOOLS);
        console.log();
        infoMsg('Automation tools:');
        for (const toolId of selectedToolIds) {
          const tool = AUTOMATION_TOOLS.find((t) => t.id === toolId);
          const detected = detectedTools.find((t) => t.id === toolId);
          const status = detected?.installed ? theme.dim('(already installed)') : theme.success('(will install)');
          const cmd = tool.installCommand[osInfo.name] || tool.installCommand.macOS;
          console.log(`    ${tool.name} ${status} — ${theme.dim(cmd)}`);
        }
      }
      if (selectedSkillIds.length > 0) {
        console.log();
        infoMsg(`Would install skills: ${selectedSkillIds.join(', ')}`);
      }
    });

    return {
      selectedMcpIds,
      selectedSkillIds,
      selectedToolIds,
      needsEnv: [],
      mcpResults: null,
      skillResults: null,
      toolResults: null,
      dryResult: { mode: 'system', dryRun: true, agents: selectedAgentIds, mcp: selectedMcpIds, skills: selectedSkillIds, tools: selectedToolIds, previews },
    };
  }

  // ── Execute ──
  quiet(runtime, () => {
    console.log();
    sectionHeader('Configuring (System)');
  });

  const result = { mcpResults: null, skillResults: null, toolResults: null, errorCount: 0 };

  if (selectedMcpIds.length > 0) {
    const spinner = startSpinner(runtime, 'Writing global MCP server configs...');
    try {
      const mcpResults = writeMcpConfigs(selectedAgents, selectedMcpIds, MCP_SERVERS, mcpInputs);
      spinner?.stop();
      result.mcpResults = mcpResults;
      recordSystemMcp(mcpResults);

      quiet(runtime, () => reportMcpResults(mcpResults));
    } catch (err) {
      spinner?.stop();
      result.errorCount++;
      if (runtime.json) throw err;
      errorMsg(`MCP config failed: ${err.message}`);
    }
  }

  if (selectedToolIds.length > 0) {
    const detectedTools = detectAutomationTools(AUTOMATION_TOOLS);
    const toolResults = { installed: [], skipped: [], errors: [] };

    const spinner = startSpinner(runtime, 'Installing automation tools...');

    for (const toolId of selectedToolIds) {
      const tool = AUTOMATION_TOOLS.find((t) => t.id === toolId);
      const detected = detectedTools.find((t) => t.id === toolId);

      if (detected?.installed) {
        toolResults.skipped.push(toolId);
        continue;
      }

      const installCmd = tool.installCommand[osInfo.name] || tool.installCommand.macOS;
      try {
        // installCmd is registry data (untrusted). Parse it to argv and run
        // without a shell so it can never be more than an allowlisted binary
        // plus plain arguments — no metacharacter injection.
        const { command, args } = parseSafeCommand(installCmd);
        execFileSync(command, args, { stdio: 'pipe', timeout: 60000 });
        toolResults.installed.push(toolId);
      } catch (err) {
        toolResults.errors.push({ id: toolId, name: tool.name, error: err.message, command: installCmd });
      }
    }

    spinner?.stop();
    result.toolResults = toolResults;
    recordSystemTools(toolResults);

    quiet(runtime, () => {
      if (toolResults.installed.length > 0) {
        successMsg(`Automation tools installed: ${toolResults.installed.join(', ')}`);
      }
      if (toolResults.skipped.length > 0) {
        infoMsg(`Already installed: ${toolResults.skipped.join(', ')}`);
      }
      for (const err of toolResults.errors) {
        warnMsg(`${err.name}: install failed. Run manually: ${err.command}`);
      }
    });
  }

  await installAndReportSkills(selectedSkillIds, selectedAgents, runtime, result, recordSystemSkills);

  const selectedServers = selectedMcpIds.map((id) => MCP_SERVERS.find((s) => s.id === id)).filter(Boolean);
  const needsEnv = selectedServers.filter((s) => s.requiresEnv);

  return { selectedMcpIds, selectedSkillIds, selectedToolIds, needsEnv, ...result };
}

// ── Project Mode — cwd project configs ──
async function runProject(ctx, runtime, { handleSkills = false } = {}) {
  const { selectedAgents, selectedAgentIds } = ctx;
  const hasCursor = selectedAgentIds.includes('cursor');

  // ── Project Detection ──
  const profile = detectProject(process.cwd());

  quiet(runtime, () => {
    console.log();
    if (profile.exists) {
      sectionHeader('Project Detected');
      console.log();
      const maturityDetail = profile.git.isRepo
        ? `${profile.maturity} (${profile.git.commitCount} commits, ${profile.git.ageInDays} days)`
        : profile.maturity;
      successMsg(`Maturity: ${maturityDetail}`);
      if (profile.detectedStacks.length > 0) successMsg(`Detected stacks: ${profile.detectedStacks.join(', ')}`);
      if (profile.tooling.linter) successMsg(`Linter: ${profile.tooling.linter.type}`);
      if (profile.tooling.formatter) successMsg(`Formatter: ${profile.tooling.formatter.type}`);
      if (profile.tooling.testFramework) successMsg(`Tests: ${profile.tooling.testFramework.type}`);
      if (profile.tooling.ci) successMsg(`CI: ${profile.tooling.ci.type}`);
      if (profile.monorepo.detected) successMsg(`Monorepo: ${profile.monorepo.type}`);
      const cmdEntries = Object.entries(profile.commands);
      if (cmdEntries.length > 0) {
        infoMsg(`Commands: ${cmdEntries.map(([k, v]) => `${k}="${v}"`).join(', ')}`);
      }
    } else {
      sectionHeader('New Project');
      console.log();
      infoMsg('No project files detected — configuring for a greenfield project.');
    }
  });

  // ── Tech Stack Selection ──
  const selectedStackIds = await resolveSelection({
    flag: runtime.stack,
    knownIds: TECH_STACKS.map((s) => s.id),
    label: 'stack ID',
    requireNonEmpty: true,
    nonInteractive: runtime.nonInteractive,
    defaults: () => (profile.detectedStacks.length > 0 ? profile.detectedStacks : ['node']),
    prompt: async () => {
      quiet(runtime, () => {
        console.log();
        sectionHeader('Select Your Tech Stack');
        console.log();
      });

      const { picked } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'picked',
          message: 'What do you work with? (Space to toggle)',
          choices: TECH_STACKS.map((s) => ({
            name: s.label + (profile.detectedStacks.includes(s.id) ? chalk.green(' (detected)') : ''),
            value: s.id,
            checked: profile.detectedStacks.includes(s.id),
          })),
          loop: false,
          validate: (ans) => ans.length > 0 || 'Please select at least one stack.',
        },
      ]);
      return picked;
    },
  });

  // ── Project Features Checklist ──
  const allFeatures = [];
  if (hasCursor) {
    allFeatures.push('cursor-rules', 'cursor-commands', 'cursor-ignore');
  }
  const agentsWithProjectMcp = selectedAgents.filter((a) => typeof a.projectMcpPath === 'function');
  if (agentsWithProjectMcp.length > 0) allFeatures.push('project-mcp');
  allFeatures.push('agent-instructions', 'agents-md', 'gitattributes', 'editorconfig');

  const selectedFeatures = await resolveSelection({
    flag: runtime.features,
    knownIds: allFeatures,
    label: 'feature ID',
    nonInteractive: runtime.nonInteractive,
    defaults: () => [...allFeatures],
    prompt: async () => {
      quiet(runtime, () => {
        console.log();
        sectionHeader('Project Configuration');
        console.log();
      });

      const featureChoices = [];
      if (hasCursor) {
        featureChoices.push(
          { name: 'Cursor Rules — stack-specific .mdc rule files', value: 'cursor-rules', checked: true },
          { name: 'Cursor Commands — /pr, /fix-issue, /review, /test-all, /refactor (as .cursor/skills)', value: 'cursor-commands', checked: true },
          { name: '.cursorignore — exclude noise from AI context', value: 'cursor-ignore', checked: true },
        );
      }
      if (agentsWithProjectMcp.length > 0) {
        featureChoices.push({ name: 'Project-level MCP — .vscode/mcp.json, .cursor/mcp.json', value: 'project-mcp', checked: true });
      }
      featureChoices.push(
        { name: 'CLAUDE.md / GEMINI.md — agent instruction files', value: 'agent-instructions', checked: true },
        { name: 'AGENTS.md — agent rules + project context (Codex CLI & other AGENTS.md-aware agents)', value: 'agents-md', checked: true },
        { name: '.gitattributes — AI-friendly git config', value: 'gitattributes', checked: true },
        { name: '.editorconfig — consistent formatting', value: 'editorconfig', checked: true },
      );

      const { picked } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'picked',
          message: 'Which project configs should we set up? (Space to toggle)',
          choices: featureChoices,
          loop: false,
        },
      ]);
      return picked;
    },
  });

  // ── Project-level MCP servers ──
  let projectMcpIds = [];
  if (selectedFeatures.includes('project-mcp')) {
    projectMcpIds = await resolveSelection({
      flag: runtime.mcp,
      knownIds: MCP_SERVERS.map((s) => s.id),
      label: 'MCP server ID',
      nonInteractive: runtime.nonInteractive,
      defaults: () => recommendedMcpIds(selectedAgentIds),
      prompt: async () => {
        console.log();
        infoMsg('Select MCP servers for project-level config (these go into the repo):');
        console.log();
        return promptMcpServers(selectedAgentIds, 'Select MCP servers for project config:');
      },
    });
  }

  const projectMcpInputs = await collectMcpInputs(projectMcpIds, MCP_SERVERS, runtime);

  // ── Agent Skills Selection ──
  // Skills install into a project-level directory (.agents/skills, read natively
  // by Codex), so they belong to project setup. When running in "both" mode the
  // system flow already handles skills, so we only prompt/install here when this
  // flow owns them (project-only mode).
  let selectedSkillIds = [];
  if (handleSkills) {
    selectedSkillIds = await selectSkills(runtime, 'Select Agent Skills', { recommendByDefault: false });
  }

  // ── Summary & Confirmation ──
  quiet(runtime, () => {
    console.log();
    sectionHeader('Project Setup Summary');
    console.log();
    console.log(theme.label('  Tools:     ') + selectedAgents.map((a) => a.name).join(', '));
    console.log(theme.label('  Stack:     ') + selectedStackIds.join(', '));
    console.log(theme.label('  Features:  ') + (selectedFeatures.length > 0 ? selectedFeatures.join(', ') : 'none'));
    if (projectMcpIds.length > 0) {
      console.log(theme.label('  Proj MCP:  ') + projectMcpIds.join(', '));
    }
    if (handleSkills) {
      console.log(theme.label('  Skills:    ') + (selectedSkillIds.length > 0 ? selectedSkillIds.join(', ') : 'none'));
    }
    console.log();
  });

  if (!runtime.nonInteractive && !(await confirm('Proceed with project setup?'))) {
    infoMsg('Setup cancelled. Run npx dxai-cli again anytime.');
    process.exit(0);
  }

  // ── Dry-run short-circuit ──
  if (runtime.dryRun) {
    quiet(runtime, () => {
      sectionHeader('Dry run — no changes written');
      infoMsg(`Would generate features: ${selectedFeatures.join(', ') || 'none'}`);
      if (projectMcpIds.length > 0) infoMsg(`Would write project MCP: ${projectMcpIds.join(', ')}`);
      if (handleSkills && selectedSkillIds.length > 0) infoMsg(`Would install skills: ${selectedSkillIds.join(', ')}`);
    });
    return {
      selectedStackIds,
      selectedFeatures,
      projectMcpIds,
      selectedSkillIds,
      dryRun: true,
    };
  }

  // ── Execute ──
  quiet(runtime, () => {
    console.log();
    sectionHeader('Configuring (Project)');
  });

  let projectMcpResults = null;
  let projectErrorCount = 0;
  if (selectedFeatures.includes('project-mcp') && projectMcpIds.length > 0) {
    const spinner = startSpinner(runtime, 'Writing project-level MCP configs...');
    try {
      const mcpResults = writeProjectMcpConfigs(agentsWithProjectMcp, projectMcpIds, MCP_SERVERS, projectMcpInputs);
      spinner?.stop();
      projectMcpResults = mcpResults;
      recordProjectMcp(mcpResults);
      quiet(runtime, () => reportMcpResults(mcpResults));
    } catch (err) {
      spinner?.stop();
      projectErrorCount++;
      if (runtime.json) throw err;
      errorMsg(`Project MCP config failed: ${err.message}`);
    }
  }

  const writtenFiles = [];

  if (selectedFeatures.includes('cursor-rules')) {
    const written = writeCursorRules(selectedStackIds, CURSOR_RULES, profile);
    for (const name of written) writtenFiles.push(path.join('.cursor', 'rules', name));
    quiet(runtime, () => {
      if (written.length > 0) successMsg(`Cursor rules created: ${written.join(', ')}`);
      else infoMsg('Cursor rules already exist, skipped');
    });
  }

  if (selectedFeatures.includes('cursor-commands')) {
    const written = writeCursorCommands(CURSOR_COMMANDS);
    for (const name of written) writtenFiles.push(path.join('.cursor', 'skills', name));
    quiet(runtime, () => {
      if (written.length > 0) successMsg(`Cursor commands created: ${written.join(', ')}`);
      else infoMsg('Cursor commands already exist, skipped');
    });
  }

  if (selectedFeatures.includes('cursor-ignore')) {
    const created = writeCursorIgnore();
    if (created) writtenFiles.push('.cursorignore');
    quiet(runtime, () => {
      if (created) successMsg('.cursorignore created');
      else infoMsg('.cursorignore already exists, skipped');
    });
  }

  if (selectedFeatures.includes('agent-instructions')) {
    const instructionFiles = writeProjectInstructions(selectedAgents, selectedStackIds, profile, {
      importAgentsMd: selectedFeatures.includes('agents-md') || fs.existsSync(path.join(process.cwd(), 'AGENTS.md')),
    });
    for (const name of instructionFiles) writtenFiles.push(name);
    quiet(runtime, () => {
      if (instructionFiles.length > 0) successMsg(`Project instructions created: ${instructionFiles.join(', ')}`);
    });
  }

  if (selectedFeatures.includes('agents-md')) {
    const created = writeAgentsMd(selectedStackIds, profile);
    if (created) writtenFiles.push('AGENTS.md');
    quiet(runtime, () => {
      if (created) successMsg('AGENTS.md created');
      else infoMsg('AGENTS.md already exists, skipped');
    });
  }

  if (selectedFeatures.includes('gitattributes')) {
    const created = writeGitattributes();
    if (created) writtenFiles.push('.gitattributes');
    quiet(runtime, () => {
      if (created) successMsg('.gitattributes created');
      else infoMsg('.gitattributes already exists, skipped');
    });
  }

  if (selectedFeatures.includes('editorconfig')) {
    const created = writeEditorconfig();
    if (created) writtenFiles.push('.editorconfig');
    quiet(runtime, () => {
      if (created) successMsg('.editorconfig created');
      else infoMsg('.editorconfig already exists, skipped');
    });
  }

  if (writtenFiles.length > 0) recordProjectFiles(writtenFiles);

  const projectResult = {
    selectedStackIds, selectedFeatures, projectMcpIds, selectedSkillIds,
    mcpResults: projectMcpResults, errorCount: projectErrorCount,
  };
  if (handleSkills) {
    await installAndReportSkills(selectedSkillIds, selectedAgents, runtime, projectResult, recordProjectSkills);
  }

  return projectResult;
}

// ── Main Entry Point ──
export async function run(mode, opts = {}) {
  // Profile resolution. Semantics:
  //   opts.profile === false      → --no-profile, skip auto-discovery
  //   opts.profile === undefined  → no flag, auto-discover defaults
  //   opts.profile === '<string>' → explicit profile name or path
  let profilePath = null;
  let mergedOpts = opts;
  if (opts.profile !== false) {
    const explicit = typeof opts.profile === 'string' ? opts.profile : null;
    profilePath = resolveProfile(explicit);
    if (explicit && !profilePath) {
      throw new Error(`Profile not found: ${explicit}`);
    }
    if (profilePath) {
      const profile = readProfile(profilePath);
      mergedOpts = mergeWithProfile(opts, profile);
      if (!mode && profile.mode) mode = profile.mode;
    }
  }

  const runtime = normalizeOptions(mergedOpts);

  quiet(runtime, () => printBanner());
  if (profilePath) quiet(runtime, () => infoMsg(`Loaded profile: ${profilePath}`));

  // Periodically refresh the catalog cache (opt-out; skips in --json/CI). Updates the
  // on-disk cache for the next run — see src/auto-update.js. Best-effort: a failure
  // here (e.g. an unwritable cache dir) must never abort the user's setup.
  try {
    await maybeRefreshCatalog(runtime);
  } catch { /* non-fatal background refresh */ }

  if (!mode) {
    if (runtime.nonInteractive) {
      // Default to "both" in non-interactive mode.
      mode = 'both';
    } else {
      console.log();
      const { selectedMode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedMode',
          message: 'What would you like to set up?',
          choices: [
            { name: 'System  — global IDE configs, MCP servers, agent skills', value: 'system' },
            { name: 'Project — AI-friendly project config (rules, CLAUDE.md, skills, etc.)', value: 'project' },
            { name: 'Both    — full system + project setup', value: 'both' },
          ],
        },
      ]);
      mode = selectedMode;
    }
  }

  const runBoth = mode === 'both';
  const ctx = await sharedSetup(runtime);

  let systemResult = null;
  if (mode === 'system' || runBoth) {
    systemResult = await runSystem(ctx, runtime);
  }

  let projectResult = null;
  if (mode === 'project' || runBoth) {
    // In "both" mode the system flow already installs skills; let the project
    // flow own them only when running project-only, to avoid double installs.
    projectResult = await runProject(ctx, runtime, { handleSkills: mode === 'project' });
  }

  // A partially failed setup must not exit 0 — CI callers rely on the code.
  const errorCount =
    (systemResult?.errorCount || 0) + countResultErrors(systemResult || {}) +
    (projectResult?.errorCount || 0) + countResultErrors(projectResult || {});
  if (errorCount > 0) process.exitCode = 1;

  if (runtime.json) {
    const out = {
      ok: errorCount === 0,
      errorCount,
      mode,
      dryRun: runtime.dryRun,
      agents: ctx.selectedAgentIds,
      system: systemResult ? {
        mcp: systemResult.selectedMcpIds || [],
        skills: systemResult.selectedSkillIds || [],
        tools: systemResult.selectedToolIds || [],
        needsEnv: (systemResult.needsEnv || []).map((s) => s.id),
        results: {
          mcp: systemResult.mcpResults || null,
          skills: systemResult.skillResults || null,
          tools: systemResult.toolResults || null,
        },
        ...(systemResult.dryResult ? { previews: systemResult.dryResult.previews } : {}),
      } : null,
      project: projectResult ? {
        stack: projectResult.selectedStackIds || [],
        features: projectResult.selectedFeatures || [],
        projectMcp: projectResult.projectMcpIds || [],
        skills: projectResult.selectedSkillIds || [],
        results: {
          mcp: projectResult.mcpResults || null,
          skills: projectResult.skillResults || null,
        },
      } : null,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  console.log();
  console.log(theme.dim('  ─────────────────────────────'));
  console.log(theme.highlight('  ✨ dxai setup complete!'));
  console.log();

  if (systemResult?.needsEnv?.length > 0) {
    warnMsg('Some MCP servers need API keys. Add these to your environment:');
    for (const s of systemResult.needsEnv) {
      for (const [envVar, desc] of Object.entries(s.requiresEnv)) {
        console.log(theme.dim(`    export ${envVar}="..."  `) + chalk.dim(`# ${desc}`));
      }
    }
    console.log();
  }

  infoMsg('Next steps:');
  let step = 1;
  if (systemResult) {
    console.log(theme.dim(`    ${step++}. Restart your IDE/agent to pick up new MCP configs`));
  }
  if (projectResult) {
    console.log(theme.dim(`    ${step++}. Customize the generated project files for your codebase`));
    if (projectResult.selectedFeatures?.includes('agent-instructions')) {
      console.log(theme.dim(`    ${step++}. Edit CLAUDE.md / GEMINI.md with project-specific instructions`));
    }
    if (projectResult.selectedFeatures?.includes('agents-md')) {
      console.log(theme.dim(`    ${step++}. Fill in AGENTS.md with your project's architecture details`));
    }
  }
  console.log(theme.dim(`    ${step}. Re-run ${chalk.cyan('npx dxai-cli')} anytime to add more tools`));
  console.log();
}

// ── Apply a saved profile (sugar for run + --yes) ──
export async function apply(nameOrPath, opts = {}) {
  const profilePath = resolveProfile(nameOrPath);
  if (!profilePath) {
    throw new Error(
      nameOrPath
        ? `Profile not found: ${nameOrPath}`
        : 'No profile found. Looked in ./.dxai/profile.json, ~/.dxai/config.json, ~/.dxairc.'
    );
  }
  const profile = readProfile(profilePath);
  const merged = mergeWithProfile({ ...opts, yes: true }, profile);
  const mode = merged.mode || 'both';
  // Pass the resolved path so run() doesn't re-discover (and respects this exact one).
  await run(mode, { ...merged, profile: profilePath });
}

// ── Save current selections as a named profile ──
export async function saveProfileCmd(nameOrPath, opts = {}) {
  const data = {
    mode: opts.mode,
    agents: opts.agents,
    mcp: opts.mcp,
    skills: opts.skills,
    features: opts.features,
    stack: opts.stack,
    mcpInputs: opts.mcpInputs,
  };
  const empty = Object.values(data).every((v) => v === undefined);
  if (empty) {
    throw new Error(
      'No selections to save. Pass values via flags, e.g.:\n' +
      '  npx dxai-cli save-profile myteam --agents cursor --mcp github,playwright --features cursor-rules,agents-md'
    );
  }

  let target;
  if (opts.here) target = { here: true };
  else if (opts.path) target = { path: opts.path };
  else target = { user: true, name: nameOrPath || 'default' };

  const written = saveProfile(data, target);
  if (!opts.json) {
    successMsg(`Profile saved → ${written}`);
  } else {
    process.stdout.write(JSON.stringify({ ok: true, path: written, profile: data }, null, 2) + '\n');
  }
  return written;
}

// ── List discoverable profiles ──
export async function listProfilesCmd(opts = {}) {
  const profiles = listProfiles();
  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: true, profiles }, null, 2) + '\n');
    return;
  }
  if (profiles.length === 0) {
    infoMsg('No profiles found.');
    return;
  }
  sectionHeader('Profiles');
  for (const p of profiles) {
    console.log(`  ${theme.label(p.name.padEnd(20))} ${theme.dim(p.scope.padEnd(10))} ${theme.dim(p.path)}`);
  }
  console.log();
}
