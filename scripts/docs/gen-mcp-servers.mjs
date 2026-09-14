import { MCP_SERVERS, MCP_CATEGORIES } from '../../src/registry/mcp-servers.js';
import { AGENT_DEFINITIONS } from '../../src/detect.js';
import { writePage, mdTable } from './lib/render.mjs';

export default function generate() {
  const sections = [];

  sections.push(
    'The bundled catalog of MCP servers. Each row shows which agents support the server and any environment variables you need to set.',
    '',
    'Pick servers in the wizard, or pass `--mcp <id1>,<id2>` to a setup command. ★ marks recommended (pre-checked) entries.',
    '',
    'The **Source** column names the record in the [official MCP Registry](https://registry.modelcontextprotocol.io) an entry is resolved from; `bundled` entries are written by hand. See [Registry Sources](/registry/custom-registry/).',
    '',
  );

  // Source of truth — stays correct as agents are added/split (see AGENT_DEFINITIONS).
  const knownAgents = AGENT_DEFINITIONS.map((a) => a.id);

  for (const cat of MCP_CATEGORIES) {
    const servers = MCP_SERVERS.filter((s) => s.category === cat.id);
    if (servers.length === 0) continue;

    sections.push(`## ${cat.label}`);
    sections.push('');
    if (cat.description) {
      sections.push(cat.description);
      sections.push('');
    }

    const rows = servers.map((s) => {
      const id = '`' + s.id + '`';
      const name = (s.recommended ? '★ ' : '') + s.name;
      const agentsSupported = knownAgents
        .filter((a) => s.configs && s.configs[a])
        .map((a) => '`' + a + '`')
        .join(', ');
      const env = s.requiresEnv
        ? Object.keys(s.requiresEnv).map((k) => '`' + k + '`').join(', ')
        : '—';
      const inputs = s.requiresInput
        ? Object.keys(s.requiresInput).map((k) => '`' + k + '`').join(', ')
        : '—';
      const source = s.registry?.name ? '`' + s.registry.name + '`' : 'bundled';
      return [id, name, s.description, agentsSupported || '—', env, inputs, source];
    });

    sections.push(mdTable(['ID', 'Name', 'Description', 'Agents', 'Required env', 'Required input', 'Source'], rows));
    sections.push('');
  }

  sections.push('## Want one that\'s missing?');
  sections.push('');
  sections.push('Four options:');
  sections.push('');
  sections.push('1. Add it straight from the official MCP Registry by name: `dxai-cli add io.github.owner/server`. No catalog change needed.');
  sections.push('2. Open a PR adding it to [`src/registry/data/mcp-servers.json`](https://github.com/nandha-kumar-hajari/dxai/main/src/registry/data/mcp-servers.json) — a `registry` block is enough, the weekly sync fills in the rest.');
  sections.push('3. Host your own catalog and point [`DXAI_REGISTRY_URL`](/registry/custom-registry/) at it.');
  sections.push('4. Add the entry directly to your tool\'s config; dxai will leave hand-added entries alone.');

  writePage({
    relativePath: 'registry/mcp-servers.md',
    frontmatter: {
      title: 'MCP Servers',
      description: `${MCP_SERVERS.length} MCP servers across ${MCP_CATEGORIES.length} categories, ${MCP_SERVERS.filter((s) => s.registry?.name).length} resolved from the official MCP Registry. Auto-generated from src/registry/data/mcp-servers.json.`,
    },
    sourceLabel: 'src/registry/data/mcp-servers.json (generator: scripts/docs/gen-mcp-servers.mjs)',
    body: sections.join('\n'),
  });
}
