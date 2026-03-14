#!/usr/bin/env node

import { run } from '../src/index.js';
import { cleanup } from '../src/cleanup.js';

const subcommand = process.argv[2];

if (subcommand === '--help' || subcommand === '-h') {
  console.log(`
  Usage: dxai [command]

  Commands:
    system    System-level setup (global IDE configs, MCP servers, skills)
    project   Project-level setup (stack, rules, CLAUDE.md, .editorconfig, etc.)
    cleanup   Remove dxai-managed configs, files, and skills
    reset     Alias for cleanup

  If no command is given, you'll be prompted to choose.
`);
  process.exit(0);
}

if (subcommand === 'cleanup' || subcommand === 'reset') {
  cleanup().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  const validModes = ['system', 'project'];
  const mode = validModes.includes(subcommand) ? subcommand : undefined;

  run(mode).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
