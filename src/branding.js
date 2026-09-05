import chalk from 'chalk';
import ora from 'ora';
import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('../package.json');

export const theme = {
  accent: chalk.cyanBright,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  dim: chalk.gray,
  highlight: chalk.bold.cyanBright,
  label: chalk.bold.cyan,
};

const BANNER = `
${chalk.cyanBright(`  ██████╗ ██╗  ██╗ █████╗ ██╗`)}
${chalk.cyanBright(`  ██╔══██╗╚██╗██╔╝██╔══██╗██║`)}
${chalk.cyan(     `  ██║  ██║ ╚███╔╝ ███████║██║`)}
${chalk.cyan(     `  ██║  ██║ ██╔██╗ ██╔══██║██║`)}
${chalk.cyanBright(`  ██████╔╝██╔╝ ██╗██║  ██║██║`)}
${chalk.cyanBright(`  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝`)}
${chalk.dim(`  ──────────── `)}${chalk.white.bold(`by`)}${chalk.dim(` ────────────`)}
${chalk.cyan(`   ██████╗ ██████╗ ██╗   ██╗`)}
${chalk.cyan(`   ██╔══██╗╚════██╗██║   ██║`)}
${chalk.cyan(`   ██║  ██║ █████╔╝██║   ██║`)}
${chalk.cyan(`   ██║  ██║ ╚═══██╗╚██╗ ██╔╝`)}
${chalk.cyan(`   ██████╔╝██████╔╝ ╚████╔╝`)}
${chalk.cyan(`   ╚═════╝ ╚═════╝   ╚═══╝`)}
${chalk.dim(`  ─────────────────────────────`)}
${chalk.bold.white(`  AI-Powered Dev Environment Setup`)}
${chalk.dim(`  v${version}`)}
`;

export function printBanner() {
  console.log(BANNER);
}

export function sectionHeader(title) {
  console.log();
  console.log(theme.label(`  ▸ ${title}`));
  console.log(theme.dim(`  ${'─'.repeat(40)}`));
}

export function successMsg(msg) {
  console.log(theme.success(`  ✓ ${msg}`));
}

export function warnMsg(msg) {
  console.log(theme.warn(`  ⚠ ${msg}`));
}

export function errorMsg(msg) {
  console.log(theme.error(`  ✗ ${msg}`));
}

export function infoMsg(msg) {
  console.log(theme.dim(`  ℹ ${msg}`));
}

// Run `fn` only when decorative output is allowed (i.e. not in --json mode).
export function quiet(runtime, fn) {
  if (runtime.json) return;
  fn();
}

// An ora spinner, or null in --json mode. Callers use `spinner?.stop()`.
export function startSpinner(runtime, text) {
  return runtime.json ? null : ora({ text, color: 'cyan' }).start();
}

// Print the per-agent outcome of a writeMcpConfigs / writeProjectMcpConfigs call.
export function reportMcpResults(results, verb = 'added') {
  for (const r of Object.values(results)) {
    if (r.added > 0) successMsg(`${r.agent}: ${r.added} MCP server(s) ${verb}` + (r.path ? ` → ${r.path}` : ''));
    if (r.skipped > 0) infoMsg(`${r.agent}: ${r.skipped} already configured, skipped`);
    for (const err of r.errors || []) warnMsg(`${r.agent}: ${err.id} — ${err.error}`);
  }
}
