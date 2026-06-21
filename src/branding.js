import chalk from 'chalk';

// ── Cyan/Teal color palette ──
export const theme = {
  accent: chalk.cyanBright,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  dim: chalk.gray,
  highlight: chalk.bold.cyanBright,
  label: chalk.bold.cyan,
};

export const BANNER = `
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
${chalk.dim(`  v1.0.0`)}
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
