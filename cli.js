#!/usr/bin/env node

import { run } from '../src/index.js';

const subcommand = process.argv[2];

if (subcommand === '--help' || subcommand === '-h') {
  console.log(`
  Usage: d3v-ai-setup [command]

  Commands:
    system    System-level setup (global IDE configs, MCP servers, skills)
    project   Project-level setup (stack, rules, CLAUDE.md, .editorconfig, etc.)

  If no command is given, you'll be prompted to choose.
`);
  process.exit(0);
}

const validModes = ['system', 'project'];
const mode = validModes.includes(subcommand) ? subcommand : undefined;

run(mode).catch((err) => {
  console.error(err);
  process.exit(1);
});
