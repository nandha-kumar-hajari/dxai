import { execSync } from 'child_process';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';

import {
  printBanner, sectionHeader, successMsg, warnMsg,
  errorMsg, infoMsg, theme,
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
import { normalizeOptions, partitionByKnown } from './runtime.js';
import { resolveProfile, readProfile, mergeWithProfile, saveProfile, listProfiles } from './profile.js';
import {
  recordSystemMcp, recordSystemSkills, recordSystemTools, recordProjectMcp, recordProjectFiles,
} from './manifest.js';

// In --json mode, suppress decorative output.
function quiet(runtime, fn) {
  if (runtime.json) return;
  fn();
}

// In non-interactive mode, fall back to defaults instead of prompting.
async function collectMcpInputs(selectedMcpIds, mcpRegistry, runtime) {
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

// ══════════════════════════════════════════════
// Shared: Banner + Detection + Agent Selection
// ══════════════════════════════════════════════
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

  // Agent selection — flag, then prompt, then default to detected.
  let selectedAgentIds;
  if (runtime.agents && runtime.agents.length > 0) {
    const knownIds = AGENT_DEFINITIONS.map((a) => a.id);
    const { valid, invalid } = partitionByKnown(runtime.agents, knownIds);
    if (invalid.length > 0) {
      throw new Error(`Unknown agent ID(s): ${invalid.join(', ')}. Known: ${knownIds.join(', ')}`);
    }
    if (valid.length === 0) throw new Error('No valid agents specified.');
    selectedAgentIds = valid;
  } else if (runtime.nonInteractive) {
    // Default to detected agents in non-interactive mode.
    selectedAgentIds = agents.filter((a) => a.installed).map((a) => a.id);
    if (selectedAgentIds.length === 0) {
      throw new Error('No agents detected. Pass --agents to choose explicitly.');
    }
  } else {
    console.log();
    sectionHeader('Select Your AI Tools');
    console.log();

    const agentChoices = AGENT_DEFINITIONS.map((def) => {
      const detected = agents.find((a) => a.id === def.id);
      const status = detected?.installed ? chalk.green(' (detected)') : '';
      return {
        name: `${def.name}${status} — ${def.description}`,
        value: def.id,
        checked: detected?.installed || false,
      };
    });

    const { selectedAgentIds: picked } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedAgentIds',
        message: 'Which AI tools do you use? (Space to toggle, Enter to confirm)',
        choices: agentChoices,
        loop: false,
        validate: (ans) => ans.length > 0 || 'Please select at least one tool.',
      },
    ]);
    selectedAgentIds = picked;
  }

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

      const { installMissing } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'installMissing',
          message: 'Would you like install commands for the missing tools?',
          default: true,
        },
      ]);

      if (installMissing) {
        for (const agent of missingAgents) {
          const cmd = INSTALL_COMMANDS[agent.id]?.[osInfo.name] || 'See official documentation';
          console.log(theme.dim(`    ${agent.name}: `) + theme.accent(cmd));
        }
        console.log();
        infoMsg('Install them and re-run dxai, or continue to configure anyway.');

        const { continueAnyway } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueAnyway',
            message: 'Continue with setup for selected tools?',
            default: true,
          },
        ]);

        if (!continueAnyway) {
          console.log();
          infoMsg('Run dxai again after installing your tools. Bye!');
          process.exit(0);
        }
      }
    }
  }

  return { osInfo, prereqs, agents, selectedAgents, selectedAgentIds };
}

// ══════════════════════════════════════════════
// System Mode — global/user-level configs
// ══════════════════════════════════════════════
async function runSystem(ctx, runtime) {
  const { osInfo, selectedAgents, selectedAgentIds } = ctx;

  // ── MCP Server Selection ──
  let selectedMcpIds;
  if (runtime.mcp !== undefined) {
    const knownIds = MCP_SERVERS.map((s) => s.id);
    const { valid, invalid } = partitionByKnown(runtime.mcp, knownIds);
    if (invalid.length > 0) {
      throw new Error(`Unknown MCP server ID(s): ${invalid.join(', ')}`);
    }
    selectedMcpIds = valid;
  } else if (runtime.nonInteractive) {
    selectedMcpIds = MCP_SERVERS
      .filter((s) => s.recommended && selectedAgentIds.some((aid) => s.configs[aid]))
      .map((s) => s.id);
  } else {
    quiet(runtime, () => {
      console.log();
      sectionHeader('Select MCP Servers (Global)');
      console.log();
      infoMsg('★ = recommended  •  Servers are configured globally for all your selected tools');
      console.log();
    });

    const mcpChoices = [];
    for (const cat of MCP_CATEGORIES) {
      const servers = MCP_SERVERS.filter(
        (s) => s.category === cat.id && selectedAgentIds.some((aid) => s.configs[aid])
      );
      if (servers.length === 0) continue;

      mcpChoices.push(new inquirer.Separator(chalk.cyan(`\n  ${cat.label}  `) + chalk.dim(cat.description)));
      for (const s of servers) {
        const rec = s.recommended ? chalk.yellow(' ★') : '';
        const envNote = s.requiresEnv ? chalk.dim(' (needs API key)') : '';
        mcpChoices.push({
          name: `${s.name}${rec} — ${chalk.dim(s.description)}${envNote}`,
          value: s.id,
          checked: !!s.recommended,
        });
      }
    }

    const { selectedMcpIds: picked } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedMcpIds',
        message: 'Select MCP servers to install globally:',
        choices: mcpChoices,
        pageSize: 25,
        loop: false,
      },
    ]);
    selectedMcpIds = picked;
  }

  // ── Suggested Automation Tools ──
  let selectedToolIds;
  if (runtime.tools !== undefined) {
    const knownIds = AUTOMATION_TOOLS.map((t) => t.id);
    const { valid, invalid } = partitionByKnown(runtime.tools, knownIds);
    if (invalid.length > 0) {
      throw new Error(`Unknown automation tool ID(s): ${invalid.join(', ')}`);
    }
    selectedToolIds = valid;
  } else if (runtime.nonInteractive) {
    selectedToolIds = AUTOMATION_TOOLS.filter((t) => t.recommended).map((t) => t.id);
  } else {
    const detectedTools = detectAutomationTools(AUTOMATION_TOOLS);

    quiet(runtime, () => {
      console.log();
      sectionHeader('Suggested Automation Tools');
      console.log();
      infoMsg('★ = suggested  •  Standalone CLIs that give your AI agents browser & device control');
      console.log();
    });

    const toolChoices = [];
    for (const cat of AUTOMATION_TOOL_CATEGORIES) {
      const catTools = detectedTools.filter((t) => t.category === cat.id);
      if (catTools.length === 0) continue;
      toolChoices.push(new inquirer.Separator(chalk.cyan(`\n  ${cat.label}  `) + chalk.dim(cat.description)));
      for (const t of catTools) {
        const rec = t.recommended ? chalk.yellow(' ★') : '';
        const status = t.installed ? chalk.green(' (detected)') : '';
        toolChoices.push({
          name: `${t.name}${rec}${status} — ${chalk.dim(t.description)}`,
          value: t.id,
          checked: !!t.recommended,
        });
      }
    }

    const { selectedToolIds: picked } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedToolIds',
        message: 'Select automation tools to install:',
        choices: toolChoices,
        loop: false,
      },
    ]);
    selectedToolIds = picked;
  }

  // ── Agent Skills Selection ──
  let selectedSkillIds;
  if (runtime.skills !== undefined) {
    const knownIds = SKILLS.map((s) => s.id);
    const { valid, invalid } = partitionByKnown(runtime.skills, knownIds);
    if (invalid.length > 0) {
      throw new Error(`Unknown skill ID(s): ${invalid.join(', ')}`);
    }
    selectedSkillIds = valid;
  } else if (runtime.nonInteractive) {
    selectedSkillIds = SKILLS.filter((s) => s.recommended).map((s) => s.id);
  } else {
    quiet(runtime, () => {
      console.log();
      sectionHeader('Select Agent Skills (Global)');
      console.log();
    });

    const skillChoices = [];
    for (const cat of SKILL_CATEGORIES) {
      const catSkills = SKILLS.filter((s) => s.category === cat.id);
      if (catSkills.length === 0) continue;

      skillChoices.push(new inquirer.Separator(chalk.cyan(`\n  ${cat.label}`)));
      for (const s of catSkills) {
        const rec = s.recommended ? chalk.yellow(' ★') : '';
        skillChoices.push({
          name: `${s.name}${rec} — ${chalk.dim(s.description)}`,
          value: s.id,
          checked: !!s.recommended,
        });
      }
    }

    const { selectedSkillIds: picked } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedSkillIds',
        message: 'Select agent skills to install:',
        choices: skillChoices,
        pageSize: 20,
        loop: false,
      },
    ]);
    selectedSkillIds = picked;
  }

  // Collect required inputs.
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

  if (!runtime.nonInteractive) {
    const { confirm } = await inquirer.prompt([
      { type: 'confirm', name: 'confirm', message: 'Proceed with system setup?', default: true },
    ]);
    if (!confirm) {
      infoMsg('Setup cancelled. Run dxai again anytime.');
      process.exit(0);
    }
  }

  // ── Dry-run short-circuit ──
  if (runtime.dryRun) {
    const previews = selectedMcpIds.length > 0
      ? previewMcpConfigs(selectedAgents, selectedMcpIds, MCP_SERVERS, mcpInputs)
      : {};

    quiet(runtime, () => {
      sectionHeader('Dry run — no changes written');
      console.log();
      for (const [_, p] of Object.entries(previews)) {
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

  const result = { mcpResults: null, skillResults: null, toolResults: null };

  if (selectedMcpIds.length > 0) {
    const spinner = runtime.json
      ? null
      : ora({ text: 'Writing global MCP server configs...', color: 'cyan' }).start();
    try {
      const mcpResults = writeMcpConfigs(selectedAgents, selectedMcpIds, MCP_SERVERS, mcpInputs);
      spinner?.stop();
      result.mcpResults = mcpResults;
      recordSystemMcp(mcpResults, selectedMcpIds);

      quiet(runtime, () => {
        for (const [agentId, r] of Object.entries(mcpResults)) {
          if (r.added > 0) {
            successMsg(`${r.agent}: ${r.added} MCP server(s) added` + (r.path ? ` → ${r.path}` : ''));
          }
          if (r.skipped > 0) {
            infoMsg(`${r.agent}: ${r.skipped} already configured, skipped`);
          }
          for (const err of r.errors || []) {
            warnMsg(`${r.agent}: Failed to configure ${err.id} — ${err.error}`);
          }
        }
      });
    } catch (err) {
      spinner?.stop();
      if (runtime.json) throw err;
      errorMsg(`MCP config failed: ${err.message}`);
    }
  }

  if (selectedToolIds.length > 0) {
    const detectedTools = detectAutomationTools(AUTOMATION_TOOLS);
    const toolResults = { installed: [], skipped: [], errors: [] };

    const spinner = runtime.json
      ? null
      : ora({ text: 'Installing automation tools...', color: 'cyan' }).start();

    for (const toolId of selectedToolIds) {
      const tool = AUTOMATION_TOOLS.find((t) => t.id === toolId);
      const detected = detectedTools.find((t) => t.id === toolId);

      if (detected?.installed) {
        toolResults.skipped.push(toolId);
        continue;
      }

      const installCmd = tool.installCommand[osInfo.name] || tool.installCommand.macOS;
      try {
        execSync(installCmd, { stdio: 'pipe', timeout: 60000 });
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

  if (selectedSkillIds.length > 0) {
    const spinner = runtime.json
      ? null
      : ora({ text: 'Installing agent skills...', color: 'cyan' }).start();
    try {
      const skillResults = installSkills(selectedSkillIds, SKILLS, selectedAgents);
      spinner?.stop();
      result.skillResults = skillResults;
      recordSystemSkills(skillResults);

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
      if (runtime.json) throw err;
      errorMsg(`Skills installation failed: ${err.message}`);
    }
  }

  const selectedServers = selectedMcpIds.map((id) => MCP_SERVERS.find((s) => s.id === id)).filter(Boolean);
  const needsEnv = selectedServers.filter((s) => s.requiresEnv);

  return { selectedMcpIds, selectedSkillIds, selectedToolIds, needsEnv, ...result };
}

// ══════════════════════════════════════════════
// Project Mode — cwd project configs
// ══════════════════════════════════════════════
async function runProject(ctx, runtime) {
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
  let selectedStackIds;
  if (runtime.stack !== undefined) {
    const knownIds = TECH_STACKS.map((s) => s.id);
    const { valid, invalid } = partitionByKnown(runtime.stack, knownIds);
    if (invalid.length > 0) {
      throw new Error(`Unknown stack ID(s): ${invalid.join(', ')}`);
    }
    if (valid.length === 0) throw new Error('No valid stacks specified.');
    selectedStackIds = valid;
  } else if (runtime.nonInteractive) {
    selectedStackIds = profile.detectedStacks.length > 0
      ? profile.detectedStacks
      : ['node']; // sensible fallback
  } else {
    quiet(runtime, () => {
      console.log();
      sectionHeader('Select Your Tech Stack');
      console.log();
    });

    const { selectedStackIds: picked } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedStackIds',
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
    selectedStackIds = picked;
  }

  // ── Project Features Checklist ──
  const allFeatures = [];
  if (hasCursor) {
    allFeatures.push('cursor-rules', 'cursor-commands', 'cursor-ignore');
  }
  const agentsWithProjectMcp = selectedAgents.filter((a) => typeof a.projectMcpPath === 'function');
  if (agentsWithProjectMcp.length > 0) allFeatures.push('project-mcp');
  allFeatures.push('agent-instructions', 'agents-md', 'gitattributes', 'editorconfig');

  let selectedFeatures;
  if (runtime.features !== undefined) {
    const { valid, invalid } = partitionByKnown(runtime.features, allFeatures);
    if (invalid.length > 0) {
      throw new Error(`Unknown feature ID(s): ${invalid.join(', ')}. Known: ${allFeatures.join(', ')}`);
    }
    selectedFeatures = valid;
  } else if (runtime.nonInteractive) {
    selectedFeatures = [...allFeatures];
  } else {
    quiet(runtime, () => {
      console.log();
      sectionHeader('Project Configuration');
      console.log();
    });

    const featureChoices = [];
    if (hasCursor) {
      featureChoices.push(
        { name: 'Cursor Rules — stack-specific .mdc rule files', value: 'cursor-rules', checked: true },
        { name: 'Cursor Commands — /pr, /fix-issue, /review, /test-all, /refactor', value: 'cursor-commands', checked: true },
        { name: '.cursorignore — exclude noise from AI context', value: 'cursor-ignore', checked: true },
      );
    }
    if (agentsWithProjectMcp.length > 0) {
      featureChoices.push({ name: 'Project-level MCP — .vscode/mcp.json, .cursor/mcp.json', value: 'project-mcp', checked: true });
    }
    featureChoices.push(
      { name: 'CLAUDE.md / GEMINI.md — agent instruction files', value: 'agent-instructions', checked: true },
      { name: 'AGENTS.md — AI-context project overview', value: 'agents-md', checked: true },
      { name: '.gitattributes — AI-friendly git config', value: 'gitattributes', checked: true },
      { name: '.editorconfig — consistent formatting', value: 'editorconfig', checked: true },
    );

    const { selectedFeatures: picked } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedFeatures',
        message: 'Which project configs should we set up? (Space to toggle)',
        choices: featureChoices,
        loop: false,
      },
    ]);
    selectedFeatures = picked;
  }

  // ── Project-level MCP servers ──
  let projectMcpIds = [];
  if (selectedFeatures.includes('project-mcp')) {
    if (runtime.mcp !== undefined) {
      const knownIds = MCP_SERVERS.map((s) => s.id);
      const { valid, invalid } = partitionByKnown(runtime.mcp, knownIds);
      if (invalid.length > 0) throw new Error(`Unknown MCP server ID(s): ${invalid.join(', ')}`);
      projectMcpIds = valid;
    } else if (runtime.nonInteractive) {
      projectMcpIds = MCP_SERVERS
        .filter((s) => s.recommended && selectedAgentIds.some((aid) => s.configs[aid]))
        .map((s) => s.id);
    } else {
      console.log();
      infoMsg('Select MCP servers for project-level config (these go into the repo):');
      console.log();

      const mcpChoices = [];
      for (const cat of MCP_CATEGORIES) {
        const servers = MCP_SERVERS.filter(
          (s) => s.category === cat.id && selectedAgentIds.some((aid) => s.configs[aid])
        );
        if (servers.length === 0) continue;

        mcpChoices.push(new inquirer.Separator(chalk.cyan(`\n  ${cat.label}  `) + chalk.dim(cat.description)));
        for (const s of servers) {
          const rec = s.recommended ? chalk.yellow(' ★') : '';
          const envNote = s.requiresEnv ? chalk.dim(' (needs API key)') : '';
          mcpChoices.push({
            name: `${s.name}${rec} — ${chalk.dim(s.description)}${envNote}`,
            value: s.id,
            checked: !!s.recommended,
          });
        }
      }

      const { selectedProjectMcpIds } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedProjectMcpIds',
          message: 'Select MCP servers for project config:',
          choices: mcpChoices,
          pageSize: 25,
          loop: false,
        },
      ]);
      projectMcpIds = selectedProjectMcpIds;
    }
  }

  const projectMcpInputs = await collectMcpInputs(projectMcpIds, MCP_SERVERS, runtime);

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
    console.log();
  });

  if (!runtime.nonInteractive) {
    const { confirm } = await inquirer.prompt([
      { type: 'confirm', name: 'confirm', message: 'Proceed with project setup?', default: true },
    ]);
    if (!confirm) {
      infoMsg('Setup cancelled. Run dxai again anytime.');
      process.exit(0);
    }
  }

  // ── Dry-run short-circuit ──
  if (runtime.dryRun) {
    quiet(runtime, () => {
      sectionHeader('Dry run — no changes written');
      infoMsg(`Would generate features: ${selectedFeatures.join(', ') || 'none'}`);
      if (projectMcpIds.length > 0) infoMsg(`Would write project MCP: ${projectMcpIds.join(', ')}`);
    });
    return {
      selectedStackIds,
      selectedFeatures,
      projectMcpIds,
      dryRun: true,
    };
  }

  // ── Execute ──
  quiet(runtime, () => {
    console.log();
    sectionHeader('Configuring (Project)');
  });

  if (selectedFeatures.includes('project-mcp') && projectMcpIds.length > 0) {
    const spinner = runtime.json ? null : ora({ text: 'Writing project-level MCP configs...', color: 'cyan' }).start();
    try {
      const mcpResults = writeProjectMcpConfigs(agentsWithProjectMcp, projectMcpIds, MCP_SERVERS, projectMcpInputs);
      spinner?.stop();
      recordProjectMcp(mcpResults, projectMcpIds);
      quiet(runtime, () => {
        for (const [_, r] of Object.entries(mcpResults)) {
          if (r.added > 0) successMsg(`${r.agent}: ${r.added} project MCP server(s) added → ${r.path}`);
          if (r.skipped > 0) infoMsg(`${r.agent}: ${r.skipped} already configured, skipped`);
        }
      });
    } catch (err) {
      spinner?.stop();
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
    for (const name of written) writtenFiles.push(path.join('.cursor', 'commands', name));
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
    const instructionFiles = writeProjectInstructions(selectedAgents, selectedStackIds, profile);
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

  return { selectedStackIds, selectedFeatures, projectMcpIds };
}

// ══════════════════════════════════════════════
// Main Entry Point
// ══════════════════════════════════════════════
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
            { name: 'Project — AI-friendly project config (rules, CLAUDE.md, etc.)', value: 'project' },
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
    projectResult = await runProject(ctx, runtime);
  }

  if (runtime.json) {
    const out = {
      ok: true,
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
  console.log(theme.dim(`    ${step}. Re-run ${chalk.cyan('npx dxai')} anytime to add more tools`));
  console.log();
}

// ══════════════════════════════════════════════
// Apply a saved profile (sugar for run + --yes)
// ══════════════════════════════════════════════
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

// ══════════════════════════════════════════════
// Save current selections as a named profile
// ══════════════════════════════════════════════
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
      '  dxai save-profile myteam --agents cursor --mcp github,playwright --features cursor-rules,agents-md'
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

// ══════════════════════════════════════════════
// List discoverable profiles
// ══════════════════════════════════════════════
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
