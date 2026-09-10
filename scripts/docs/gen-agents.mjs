import { AGENT_DEFINITIONS, INSTALL_COMMANDS, AGENT_ID_ALIASES } from '../../src/detect.js';
import { writePage, mdTable } from './lib/render.mjs';

// Render a home-relative path the same way on every generator host so the
// committed page never drifts with the machine that regenerated it.
const HOME = '/home/you';
const tilde = (p) => (typeof p === 'string' ? p.replace(HOME, '~') : p);
const code = (s) => '`' + s + '`';
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function describeDialect(d) {
  if (!d) return '—';
  if (d.kind === 'claude-cli') return '`claude mcp add --scope user …`';
  if (d.kind === 'toml') return 'TOML `[mcp_servers.<id>]`, env forwarded via `env_vars`';
  const env = { dollar: '`${VAR}`', vscode: '`${env:VAR}`', literal: 'value substituted at write time' }[d.envRef] || '—';
  const typed = d.typed ? ` · \`type\` on ${Object.keys(d.typed).join('/')}` : '';
  return `JSON, remote key \`${d.urlKey}\`, env ${env}${typed}`;
}

export default function generate() {
  const sections = [];

  sections.push(
    'Every tool dxai can detect and configure, generated from `AGENT_DEFINITIONS` in `src/detect.js` — the single source of truth the CLI, tests and health checks all read.',
    '',
    'Each definition is verified against the vendor\'s current documentation and stamped with the date. The weekly agent-health workflow flags entries past their review window, install channels that disappeared, and docs that moved.',
    '',
  );

  sections.push('## Detection');
  sections.push('');
  sections.push('An agent counts as installed when any signal hits: a command on `PATH`, a macOS app bundle, or a documented install path that is often missing from `PATH`. The state directory is reported separately.');
  sections.push('');
  sections.push(mdTable(
    ['ID', 'Name', 'Commands', 'macOS app', 'Install paths', 'State dir'],
    AGENT_DEFINITIONS.map((a) => [
      code(a.id),
      a.name,
      list(a.detectCommand).map(code).join(', ') || '—',
      list(a.detectApp).map(code).join(', ') || '—',
      (typeof a.detectPaths === 'function' ? a.detectPaths(HOME) : []).map((p) => code(tilde(p))).join(', ') || '—',
      code(tilde(a.configDir(HOME))),
    ]),
  ));
  sections.push('');

  sections.push('## MCP configuration');
  sections.push('');
  sections.push('Where dxai writes MCP servers for each agent, and the dialect it writes them in. Paths are shown for macOS/Linux; Windows equivalents follow each tool\'s convention (`%APPDATA%`, `%LOCALAPPDATA%`).');
  sections.push('');
  sections.push(mdTable(
    ['ID', 'Global file', 'Project file', 'Key', 'Dialect'],
    AGENT_DEFINITIONS.map((a) => [
      code(a.id),
      a.configFormat === 'cli' ? code(tilde(a.globalMcpPath(HOME))) + ' (via CLI)' : code(tilde(a.globalMcpPath(HOME))),
      typeof a.projectMcpPath === 'function' ? code('./' + a.projectMcpPath()) : '—',
      code(a.mcpKey) + (a.projectMcpKey && a.projectMcpKey !== a.mcpKey ? ' / ' + code(a.projectMcpKey) : ''),
      describeDialect(a.mcpDialect) + (a.projectMcpDialect ? '; project: ' + describeDialect(a.projectMcpDialect) : ''),
    ]),
  ));
  sections.push('');

  sections.push('## Install commands');
  sections.push('');
  sections.push(mdTable(
    ['ID', 'macOS', 'Linux', 'Windows'],
    AGENT_DEFINITIONS.map((a) => {
      const c = INSTALL_COMMANDS[a.id] || {};
      return [code(a.id), c.macOS ? code(c.macOS) : '—', c.Linux ? code(c.Linux) : '—', c.Windows ? code(c.Windows) : '—'];
    }),
  ));
  sections.push('');

  const notices = AGENT_DEFINITIONS.filter((a) => a.notice);
  if (notices.length) {
    sections.push('## Notices');
    sections.push('');
    for (const a of notices) sections.push(`- **${a.name}** — ${a.notice}`);
    sections.push('');
  }

  const aliases = Object.entries(AGENT_ID_ALIASES);
  if (aliases.length) {
    sections.push('## Former ids');
    sections.push('');
    sections.push('Renamed tools keep answering to their old id in `--agents`, profiles and manifests.');
    sections.push('');
    sections.push(mdTable(['Former id', 'Current id'], aliases.map(([from, to]) => [code(from), code(to)])));
    sections.push('');
  }

  sections.push('## Verification');
  sections.push('');
  sections.push(mdTable(
    ['ID', 'Verified', 'Checked against'],
    AGENT_DEFINITIONS.map((a) => [code(a.id), a.verifiedAt || '—', (a.docs || []).map((u) => `<${u}>`).join(', ') || '—']),
  ));
  sections.push('');

  writePage({
    relativePath: 'reference/agents.md',
    frontmatter: {
      title: 'Supported Agents',
      description: `${AGENT_DEFINITIONS.length} tools dxai detects and configures. Auto-generated from src/detect.js.`,
    },
    sourceLabel: 'src/detect.js (generator: scripts/docs/gen-agents.mjs)',
    body: sections.join('\n'),
  });

}
