#!/usr/bin/env node

import { Command, Option } from 'commander';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { run, apply, saveProfileCmd, listProfilesCmd } from '../src/index.js';
import { cleanup } from '../src/cleanup.js';
import { listCmd, statusCmd, doctorCmd } from '../src/inspect.js';
import { updateCmd } from '../src/update.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// Comma-separated list parser for repeatable selection flags.
const csv = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);

// Build the configured commander program. Exported so doc generators (and any
// other tooling) can introspect subcommands and options as data.
export function buildProgram() {
  const program = new Command();

  program
    .name('dxai')
    .description('Interactive CLI to bootstrap your AI-powered dev environment.')
    .version(pkg.version, '-v, --version', 'output the version number')
    .showHelpAfterError('(run with --help for usage)');

  // Shared options applied to setup subcommands.
  const sharedSetupOptions = (cmd) =>
    cmd
      .addOption(new Option('-y, --yes', 'skip prompts; use defaults / values from flags'))
      .addOption(new Option('--agents <list>', 'comma-separated agent IDs (cursor,claude-code,vscode,codex,gemini,windsurf,antigravity-ide,antigravity-cli)').argParser(csv))
      .addOption(new Option('--mcp <list>', 'comma-separated MCP server IDs').argParser(csv))
      .addOption(new Option('--skills <list>', 'comma-separated skill IDs').argParser(csv))
      .addOption(new Option('--features <list>', 'comma-separated project feature IDs').argParser(csv))
      .addOption(new Option('--stack <list>', 'comma-separated tech stack IDs').argParser(csv))
      .addOption(new Option('--profile <nameOrPath>', 'load a saved profile (name or path)'))
      .addOption(new Option('--no-profile', 'skip auto-discovery of project/user profiles'))
      .addOption(new Option('--json', 'emit machine-readable JSON output (no colors, no spinners)'))
      .addOption(new Option('--dry-run', 'preview changes without writing'));

  sharedSetupOptions(
    program
      .command('system')
      .description('System-level setup (global IDE configs, MCP servers, skills)')
      .action(async (opts) => {
        await run('system', opts);
      })
  );

  sharedSetupOptions(
    program
      .command('project')
      .description('Project-level setup (stack, rules, CLAUDE.md, .editorconfig, etc.)')
      .action(async (opts) => {
        await run('project', opts);
      })
  );

  sharedSetupOptions(
    program
      .command('both')
      .description('Run system + project setup in one go')
      .action(async (opts) => {
        await run('both', opts);
      })
  );

  program
    .command('cleanup')
    .alias('reset')
    .description('Remove dxai-managed configs, files, and skills')
    .action(async () => {
      await cleanup();
    });

  // dxai apply [name|path] — non-interactive run from a saved profile
  program
    .command('apply [nameOrPath]')
    .description('Run setup using a saved profile (auto-loads ./.dxai/profile.json if no name given)')
    .addOption(new Option('--json', 'emit machine-readable JSON output'))
    .addOption(new Option('--dry-run', 'preview changes without writing'))
    .action(async (nameOrPath, opts) => {
      await apply(nameOrPath, opts);
    });

  // dxai save-profile <name> — capture flag values into a profile file
  program
    .command('save-profile [name]')
    .description('Save selections as a profile. Defaults to ~/.dxai/profiles/<name>.json')
    .addOption(new Option('--mode <mode>', 'mode to record: system | project | both'))
    .addOption(new Option('--agents <list>', 'comma-separated agent IDs').argParser(csv))
    .addOption(new Option('--mcp <list>', 'comma-separated MCP server IDs').argParser(csv))
    .addOption(new Option('--skills <list>', 'comma-separated skill IDs').argParser(csv))
    .addOption(new Option('--features <list>', 'comma-separated feature IDs').argParser(csv))
    .addOption(new Option('--stack <list>', 'comma-separated stack IDs').argParser(csv))
    .addOption(new Option('--here', 'save as project-local ./.dxai/profile.json instead'))
    .addOption(new Option('--path <path>', 'save to an explicit file path'))
    .addOption(new Option('--json', 'emit machine-readable JSON output'))
    .action(async (name, opts) => {
      await saveProfileCmd(name, opts);
    });

  // dxai profiles — list discoverable profiles
  program
    .command('profiles')
    .description('List discoverable profiles (~/.dxai/profiles + ./.dxai)')
    .addOption(new Option('--json', 'emit machine-readable JSON output'))
    .action(async (opts) => {
      await listProfilesCmd(opts);
    });

  // dxai list — show what dxai installed (from manifest)
  program
    .command('list')
    .description('Show dxai-managed installs from the manifest (system + project)')
    .addOption(new Option('--json', 'emit machine-readable JSON output'))
    .action(async (opts) => {
      await listCmd(opts);
    });

  // dxai status — diff manifest vs actual config files
  program
    .command('status')
    .description('Compare manifest with live config files; surface drift')
    .addOption(new Option('--json', 'emit machine-readable JSON output'))
    .action(async (opts) => {
      await statusCmd(opts);
    });

  // dxai doctor — validate environment + configs
  program
    .command('doctor')
    .description('Validate dxai installation: configs parse, env vars set, tools on PATH')
    .addOption(new Option('--json', 'emit machine-readable JSON output'))
    .action(async (opts) => {
      await doctorCmd(opts);
    });

  // dxai update — refresh registry cache (MCP servers, skills) from remote
  program
    .command('update')
    .description('Fetch the latest registry (MCP servers, skills) and cache it locally')
    .addOption(new Option('--json', 'emit machine-readable JSON output'))
    .action(async (opts) => {
      await updateCmd(opts);
    });

  // Default action when no subcommand is given — preserve interactive menu.
  sharedSetupOptions(
    program
      .command('start', { isDefault: true, hidden: true })
      .description('Interactive menu (default when no subcommand is given)')
      .action(async (opts) => {
        await run(undefined, opts);
      })
  );

  // Examples block.
  program.addHelpText(
    'after',
    `
Examples:
  $ dxai                                      # interactive menu
  $ dxai system                               # interactive system setup
  $ dxai project --yes                        # accept defaults, no prompts
  $ dxai system -y --agents cursor,claude-code --mcp github,playwright
  $ dxai project -y --stack react,node --features cursor-rules,agents-md
  $ CI=true dxai system --agents cursor       # non-interactive (CI mode)
  $ dxai save-profile myteam --agents cursor --mcp github,playwright
  $ dxai apply myteam                         # run setup from a saved profile
  $ dxai apply --dry-run                      # auto-load ./.dxai/profile.json
  $ dxai profiles                             # list saved profiles
  $ dxai cleanup                              # remove dxai-managed configs

Profiles are auto-loaded from (in order):
  ./.dxai/profile.json   (project-local)
  ~/.dxai/config.json    (user-level)
  ~/.dxairc(.json)
Pass --no-profile to skip auto-discovery, or --profile <nameOrPath> to override.

Environment:
  CI=true        Force non-interactive output (plain text, no spinners)
  NO_COLOR=1     Disable colored output
  DXAI_DRY_RUN=1 Equivalent to --dry-run
`
  );

  return program;
}

// Only parse argv when invoked as the entry script (not when imported).
const invokedDirectly = (() => {
  try {
    if (!process.argv[1]) return false;
    const selfPath = realpathSync(fileURLToPath(import.meta.url));
    const argvPath = realpathSync(process.argv[1]);
    return selfPath === argvPath;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  buildProgram().parseAsync(process.argv).catch((err) => {
    console.error(err.stack || err.message || err);
    process.exit(1);
  });
}
