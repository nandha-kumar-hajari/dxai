// Shared selection resolution for the setup flows.
//
// Every selectable registry (agents, MCP servers, skills, automation tools,
// stacks, features) resolves the same way, in the same precedence order:
//   1. explicit flag values  → validate against known IDs, throw with a hint
//   2. non-interactive mode  → computed defaults
//   3. interactive mode      → prompt
// This module centralizes that flow so the wizard code declares *what* each
// selection looks like instead of re-implementing the triplet per registry.

import inquirer from 'inquirer';
import chalk from 'chalk';
import { partitionByKnown } from './runtime.js';

// Every interactive question goes through here. Without a terminal on stdin
// inquirer either blocks forever (piped stdin) or crashes with
// ERR_USE_AFTER_CLOSE (closed stdin), so refuse up front with a hint instead.
export class NoTerminalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NoTerminalError';
  }
}

export function assertInteractive(stdin = process.stdin) {
  if (stdin && stdin.isTTY) return;
  throw new NoTerminalError(
    'This step needs an interactive terminal, but stdin is not a TTY. ' +
    'Re-run with --yes (or CI=true) to accept defaults, or --json for machine-readable output.'
  );
}

export async function prompt(questions) {
  assertInteractive();
  return inquirer.prompt(questions);
}

// Resolve one selection. `flag` is the raw CLI flag value (undefined = not
// passed), `defaults`/`prompt` are lazy so they only run when actually needed.
export async function resolveSelection({
  flag,
  knownIds,
  label,
  requireNonEmpty = false,
  nonInteractive,
  defaults,
  prompt,
}) {
  if (flag !== undefined) {
    const { valid, invalid } = partitionByKnown(flag, knownIds);
    if (invalid.length > 0) {
      throw new Error(`Unknown ${label}(s): ${invalid.join(', ')}. Known: ${knownIds.join(', ')}`);
    }
    if (requireNonEmpty && valid.length === 0) {
      throw new Error(`No valid ${label}s specified.`);
    }
    return valid;
  }
  if (nonInteractive) return defaults();
  return prompt();
}

// Build inquirer checkbox choices for a categorized catalog (MCP servers,
// skills, automation tools): a cyan separator per category, ★ on recommended
// entries, checked-by-default when recommended. `decorate(item)` may return
// { status, note, checked } to append per-item annotations or override the
// default checked state.
export function buildCatalogChoices(categories, items, { decorate } = {}) {
  const choices = [];
  for (const cat of categories) {
    const catItems = items.filter((i) => i.category === cat.id);
    if (catItems.length === 0) continue;

    const header = chalk.cyan(`\n  ${cat.label}  `) + (cat.description ? chalk.dim(cat.description) : '');
    choices.push(new inquirer.Separator(header));
    for (const item of catItems) {
      const rec = item.recommended ? chalk.yellow(' ★') : '';
      const extra = decorate ? decorate(item) || {} : {};
      choices.push({
        name: `${item.name}${rec}${extra.status || ''} — ${chalk.dim(item.description)}${extra.note || ''}`,
        value: item.id,
        checked: extra.checked ?? !!item.recommended,
      });
    }
  }
  return choices;
}

// Yes/no prompt. Returns the boolean answer.
export async function confirm(message, { defaultValue = true } = {}) {
  const { answer } = await prompt([
    { type: 'confirm', name: 'answer', message, default: defaultValue },
  ]);
  return answer;
}
