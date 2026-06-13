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
      return [id, name, s.description, agentsSupported || '—', env, inputs];
    });

    sections.push(mdTable(['ID', 'Name', 'Description', 'Agents', 'Required env', 'Required input'], rows));
    sections.push('');
  }

  sections.push('## Want one that\'s missing?');
  sections.push('');
  sections.push('Three options:');
  sections.push('');
  sections.push('1. Open a PR adding it to [`src/registry/data/mcp-servers.json`](https://github.com/nandha-kumar-hajari/dxai/main/src/registry/data/mcp-servers.json).');
  sections.push('2. Host your own catalog and point [`DXAI_REGISTRY_URL`](/dxai/registry/custom-registry/) at it.');
  sections.push('3. Add the entry directly to your tool\'s config; dxai will leave hand-added entries alone.');

  writePage({
    relativePath: 'registry/mcp-servers.md',
    frontmatter: {
      title: 'MCP Servers',
      description: `${MCP_SERVERS.length} MCP servers across ${MCP_CATEGORIES.length} categories. Auto-generated from src/registry/data/mcp-servers.json.`,
    },
    sourceLabel: 'src/registry/data/mcp-servers.json (generator: scripts/docs/gen-mcp-servers.mjs)',
    body: sections.join('\n'),
  });
}
