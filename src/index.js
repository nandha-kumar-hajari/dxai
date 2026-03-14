import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';

import {
  printBanner, sectionHeader, successMsg, warnMsg,
  errorMsg, infoMsg, theme,
} from './branding.js';
import {
  detectOS, checkPrerequisites, detectAgents,
  printDetectionResults, AGENT_DEFINITIONS, INSTALL_COMMANDS,
} from './detect.js';
import { MCP_SERVERS, MCP_CATEGORIES } from './registry/mcp-servers.js';
import { SKILLS, SKILL_CATEGORIES } from './registry/skills.js';
import { TECH_STACKS, CURSOR_RULES, CURSOR_COMMANDS, CLAUDE_MD_TEMPLATE, GEMINI_MD_TEMPLATE } from './registry/stacks.js';
import {
  writeMcpConfigs, writeProjectMcpConfigs, writeCursorRules, writeCursorCommands,
  writeCursorIgnore, writeProjectInstructions, installSkills,
  writeGitattributes, writeEditorconfig, writeAgentsMd,
} from './config-writer.js';

// ══════════════════════════════════════════════
// Shared: Banner + Detection + Agent Selection
// ══════════════════════════════════════════════
async function sharedSetup() {
  const osInfo = detectOS();
  const prereqs = checkPrerequisites();
  const agents = detectAgents(osInfo.home);

  sectionHeader('Environment Detection');
  printDetectionResults(osInfo, prereqs, agents);

  if (!prereqs.node.installed) {
    console.log();
    errorMsg('Node.js is required. Install it from https://nodejs.org');
    process.exit(1);
  }

  console.log();

  // Agent/IDE Selection
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

  const { selectedAgentIds } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedAgentIds',
      message: 'Which AI tools do you use? (Space to toggle, Enter to confirm)',
      choices: agentChoices,
      loop: false,
      validate: (ans) => ans.length > 0 || 'Please select at least one tool.',
    },
  ]);

  const selectedAgents = AGENT_DEFINITIONS.filter((a) => selectedAgentIds.includes(a.id));

  // Offer to install missing agents
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

  return { osInfo, prereqs, agents, selectedAgents, selectedAgentIds };
}

// ══════════════════════════════════════════════
// System Mode — global/user-level configs
// ══════════════════════════════════════════════
async function runSystem(ctx) {
  const { osInfo, selectedAgents, selectedAgentIds } = ctx;

  // ── MCP Server Selection ──
  console.log();
  sectionHeader('Select MCP Servers (Global)');
  console.log();
  infoMsg('★ = recommended  •  Servers are configured globally for all your selected tools');
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

  const { selectedMcpIds } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedMcpIds',
      message: 'Select MCP servers to install globally:',
      choices: mcpChoices,
      pageSize: 25,
      loop: false,
    },
  ]);

  // ── Agent Skills Selection ──
  console.log();
  sectionHeader('Select Agent Skills (Global)');
  console.log();

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

  const { selectedSkillIds } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedSkillIds',
      message: 'Select agent skills to install:',
      choices: skillChoices,
      pageSize: 20,
      loop: false,
    },
  ]);

  // ── Summary & Confirmation ──
  console.log();
  sectionHeader('System Setup Summary');
  console.log();

  console.log(theme.label('  Tools:     ') + selectedAgents.map((a) => a.name).join(', '));
  console.log(theme.label('  MCP:       ') + (selectedMcpIds.length > 0 ? selectedMcpIds.join(', ') : 'none'));
  console.log(theme.label('  Skills:    ') + (selectedSkillIds.length > 0 ? selectedSkillIds.join(', ') : 'none'));
  console.log();

  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Proceed with system setup?', default: true },
  ]);

  if (!confirm) {
    infoMsg('Setup cancelled. Run dxai again anytime.');
    process.exit(0);
  }

  // ── Execute ──
  console.log();
  sectionHeader('Configuring (System)');

  // 1. MCP Servers (global paths)
  if (selectedMcpIds.length > 0) {
    const spinner = ora({ text: 'Writing global MCP server configs...', color: 'cyan' }).start();
    try {
      const mcpResults = writeMcpConfigs(selectedAgents, selectedMcpIds, MCP_SERVERS);
      spinner.stop();

      for (const [agentId, result] of Object.entries(mcpResults)) {
        if (result.added > 0) {
          successMsg(`${result.agent}: ${result.added} MCP server(s) added` + (result.path ? ` → ${result.path}` : ''));
        }
        if (result.skipped > 0) {
          infoMsg(`${result.agent}: ${result.skipped} already configured, skipped`);
        }
        for (const err of result.errors || []) {
          warnMsg(`${result.agent}: Failed to configure ${err.id} — ${err.error}`);
        }
      }
    } catch (err) {
      spinner.stop();
      errorMsg(`MCP config failed: ${err.message}`);
    }
  }

  // 2. Agent Skills (global install)
  if (selectedSkillIds.length > 0) {
    const spinner = ora({ text: 'Installing agent skills...', color: 'cyan' }).start();
    try {
      const skillResults = installSkills(selectedSkillIds, SKILLS, selectedAgents);
      spinner.stop();

      if (skillResults.installed.length > 0) {
        successMsg(`Skills installed: ${skillResults.installed.join(', ')}`);
        infoMsg(`Skills directory: ${skillResults.directory}`);
      }
      for (const err of skillResults.errors) {
        warnMsg(`Skill "${err.name}": ${err.error}`);
      }
    } catch (err) {
      spinner.stop();
      errorMsg(`Skills installation failed: ${err.message}`);
    }
  }

  // Show env var reminders
  const selectedServers = selectedMcpIds.map((id) => MCP_SERVERS.find((s) => s.id === id)).filter(Boolean);
  const needsEnv = selectedServers.filter((s) => s.requiresEnv);

  return { selectedMcpIds, selectedSkillIds, needsEnv };
}

// ══════════════════════════════════════════════
// Project Mode — cwd project configs
// ══════════════════════════════════════════════
async function runProject(ctx) {
  const { selectedAgents, selectedAgentIds } = ctx;
  const hasCursor = selectedAgentIds.includes('cursor');

  // ── Tech Stack Selection ──
  console.log();
  sectionHeader('Select Your Tech Stack');
  console.log();

  const { selectedStackIds } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedStackIds',
      message: 'What do you work with? (Space to toggle)',
      choices: TECH_STACKS.map((s) => ({
        name: s.label,
        value: s.id,
      })),
      loop: false,
      validate: (ans) => ans.length > 0 || 'Please select at least one stack.',
    },
  ]);

  // ── Project Features Checklist ──
  console.log();
  sectionHeader('Project Configuration');
  console.log();

  const featureChoices = [];

  // Cursor-specific options — only if Cursor is selected
  if (hasCursor) {
    featureChoices.push(
      { name: 'Cursor Rules — stack-specific .mdc rule files', value: 'cursor-rules', checked: true },
      { name: 'Cursor Commands — /pr, /fix-issue, /review, /test-all, /refactor', value: 'cursor-commands', checked: true },
      { name: '.cursorignore — exclude noise from AI context', value: 'cursor-ignore', checked: true },
    );
  }

  // Project-level MCP — only for agents that support projectMcpPath
  const agentsWithProjectMcp = selectedAgents.filter((a) => typeof a.projectMcpPath === 'function');
  if (agentsWithProjectMcp.length > 0) {
    featureChoices.push(
      { name: 'Project-level MCP — .vscode/mcp.json, .cursor/mcp.json', value: 'project-mcp', checked: true },
    );
  }

  // Universal project configs
  featureChoices.push(
    { name: 'CLAUDE.md / GEMINI.md — agent instruction files', value: 'agent-instructions', checked: true },
    { name: 'AGENTS.md — AI-context project overview', value: 'agents-md', checked: true },
    { name: '.gitattributes — AI-friendly git config', value: 'gitattributes', checked: true },
    { name: '.editorconfig — consistent formatting', value: 'editorconfig', checked: true },
  );

  const { selectedFeatures } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedFeatures',
      message: 'Which project configs should we set up? (Space to toggle)',
      choices: featureChoices,
      loop: false,
    },
  ]);

  // If project MCP selected, prompt for which servers
  let projectMcpIds = [];
  if (selectedFeatures.includes('project-mcp')) {
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

  // ── Summary & Confirmation ──
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

  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Proceed with project setup?', default: true },
  ]);

  if (!confirm) {
    infoMsg('Setup cancelled. Run dxai again anytime.');
    process.exit(0);
  }

  // ── Execute ──
  console.log();
  sectionHeader('Configuring (Project)');

  // 1. Project-level MCP
  if (selectedFeatures.includes('project-mcp') && projectMcpIds.length > 0) {
    const spinner = ora({ text: 'Writing project-level MCP configs...', color: 'cyan' }).start();
    try {
      const mcpResults = writeProjectMcpConfigs(agentsWithProjectMcp, projectMcpIds, MCP_SERVERS);
      spinner.stop();

      for (const [agentId, result] of Object.entries(mcpResults)) {
        if (result.added > 0) {
          successMsg(`${result.agent}: ${result.added} project MCP server(s) added → ${result.path}`);
        }
        if (result.skipped > 0) {
          infoMsg(`${result.agent}: ${result.skipped} already configured, skipped`);
        }
      }
    } catch (err) {
      spinner.stop();
      errorMsg(`Project MCP config failed: ${err.message}`);
    }
  }

  // 2. Cursor Rules
  if (selectedFeatures.includes('cursor-rules')) {
    const written = writeCursorRules(selectedStackIds, CURSOR_RULES);
    if (written.length > 0) {
      successMsg(`Cursor rules created: ${written.join(', ')}`);
    } else {
      infoMsg('Cursor rules already exist, skipped');
    }
  }

  // 3. Cursor Commands
  if (selectedFeatures.includes('cursor-commands')) {
    const written = writeCursorCommands(CURSOR_COMMANDS);
    if (written.length > 0) {
      successMsg(`Cursor commands created: ${written.join(', ')}`);
    } else {
      infoMsg('Cursor commands already exist, skipped');
    }
  }

  // 4. .cursorignore
  if (selectedFeatures.includes('cursor-ignore')) {
    const created = writeCursorIgnore();
    if (created) {
      successMsg('.cursorignore created');
    } else {
      infoMsg('.cursorignore already exists, skipped');
    }
  }

  // 5. CLAUDE.md / GEMINI.md
  if (selectedFeatures.includes('agent-instructions')) {
    const instructionFiles = writeProjectInstructions(selectedAgents, selectedStackIds, {
      claudeMd: CLAUDE_MD_TEMPLATE,
      geminiMd: GEMINI_MD_TEMPLATE,
    });
    if (instructionFiles.length > 0) {
      successMsg(`Project instructions created: ${instructionFiles.join(', ')}`);
    }
  }

  // 6. AGENTS.md
  if (selectedFeatures.includes('agents-md')) {
    const created = writeAgentsMd(selectedStackIds);
    if (created) {
      successMsg('AGENTS.md created');
    } else {
      infoMsg('AGENTS.md already exists, skipped');
    }
  }

  // 7. .gitattributes
  if (selectedFeatures.includes('gitattributes')) {
    const created = writeGitattributes();
    if (created) {
      successMsg('.gitattributes created');
    } else {
      infoMsg('.gitattributes already exists, skipped');
    }
  }

  // 8. .editorconfig
  if (selectedFeatures.includes('editorconfig')) {
    const created = writeEditorconfig();
    if (created) {
      successMsg('.editorconfig created');
    } else {
      infoMsg('.editorconfig already exists, skipped');
    }
  }

  return { selectedStackIds, selectedFeatures, projectMcpIds };
}

// ══════════════════════════════════════════════
// Main Entry Point
// ══════════════════════════════════════════════
export async function run(mode) {
  printBanner();

  // If no mode given, prompt user to pick
  if (!mode) {
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

  const runBoth = mode === 'both';

  // Shared setup (detection + agent selection) — only once
  const ctx = await sharedSetup();

  // System flow
  let systemResult = null;
  if (mode === 'system' || runBoth) {
    systemResult = await runSystem(ctx);
  }

  // Project flow
  let projectResult = null;
  if (mode === 'project' || runBoth) {
    projectResult = await runProject(ctx);
  }

  // ══════════════════════════════════════════════
  // Done!
  // ══════════════════════════════════════════════
  console.log();
  console.log(theme.dim('  ─────────────────────────────'));
  console.log(theme.highlight('  ✨ dxai setup complete!'));
  console.log();

  // Show env var reminders from system setup
  if (systemResult?.needsEnv?.length > 0) {
    warnMsg('Some MCP servers need API keys. Add these to your environment:');
    for (const s of systemResult.needsEnv) {
      for (const [envVar, desc] of Object.entries(s.requiresEnv)) {
        console.log(theme.dim(`    export ${envVar}="..."  `) + chalk.dim(`# ${desc}`));
      }
    }
    console.log();
  }

  // Next steps
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
