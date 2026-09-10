import { PROFILE_KEYS } from '../../src/profile.js';
import { writePage, mdTable } from './lib/render.mjs';

const KEY_DOCS = {
  mode: { type: '`"system"` | `"project"` | `"both"`', desc: 'Default mode `dxai apply` runs when this profile is active.' },
  agents: { type: '`string[]`', desc: 'Agent IDs to configure — see [Supported Agents](/reference/agents/) for the list; former ids (e.g. windsurf) are accepted.' },
  mcp: { type: '`string[]`', desc: 'MCP server IDs to install. See [Registry / MCP servers](/registry/mcp-servers/).' },
  skills: { type: '`string[]`', desc: 'Skill IDs to install. See [Registry / Skills](/registry/skills/).' },
  features: { type: '`string[]`', desc: 'Project features to generate (cursor-rules, agents-md, editorconfig, etc.).' },
  stack: { type: '`string[]`', desc: 'Tech stack IDs. See [Registry / Stacks](/registry/stacks/).' },
  mcpInputs: { type: '`object`', desc: 'Per-server input values, keyed by server ID. Example: `{"filesystem": {"allowedPath": "~"}}`.' },
};

export default function generate() {
  const sections = [];

  sections.push(
    'A profile is a JSON file capturing what `dxai system` / `dxai project` should install. CLI flags always beat profile values.',
    '',
    'Auto-discovery: `./.dxai/profile.json` → `~/.dxai/config.json` → `~/.dxairc`. Override with `--profile <nameOrPath>`. See [Guide / Profiles](/guide/profiles/) for usage.',
    '',
  );

  sections.push('## Fields');
  sections.push('');
  const rows = PROFILE_KEYS.map((k) => {
    const meta = KEY_DOCS[k] || { type: '—', desc: '—' };
    return ['`' + k + '`', meta.type, meta.desc];
  });
  sections.push(mdTable(['Key', 'Type', 'Description'], rows));
  sections.push('');

  sections.push('## Example');
  sections.push('');
  sections.push('```json');
  sections.push(JSON.stringify({
    mode: 'both',
    agents: ['cursor', 'claude-code'],
    mcp: ['github', 'playwright', 'context7'],
    skills: ['frontend-design'],
    features: ['cursor-rules', 'agents-md', 'editorconfig'],
    stack: ['react', 'node'],
    mcpInputs: { filesystem: { allowedPath: '~/Code' } },
  }, null, 2));
  sections.push('```');
  sections.push('');

  sections.push('## Forward compatibility');
  sections.push('');
  sections.push('Unknown keys are silently dropped when the profile is read. New keys can be added in future dxai releases without breaking existing profiles.');

  writePage({
    relativePath: 'reference/profile-schema.md',
    frontmatter: {
      title: 'Profile Schema',
      description: `Fields a dxai profile JSON file may contain. ${PROFILE_KEYS.length} keys.`,
    },
    sourceLabel: 'src/profile.js (PROFILE_KEYS) — generator: scripts/docs/gen-profile-schema.mjs',
    body: sections.join('\n'),
  });
}
