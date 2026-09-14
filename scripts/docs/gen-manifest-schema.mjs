import {
  emptyManifest, MANIFEST_VERSION,
  SYSTEM_MANIFEST_PATH, PROJECT_MANIFEST_PATH,
} from '../../src/manifest.js';
import { writePage, mdTable } from './lib/render.mjs';

const FIELD_DOCS = {
  version: { type: '`number`', desc: 'Manifest schema version. Used for forward-compatible migrations. Currently `' + MANIFEST_VERSION + '`.' },
  createdAt: { type: '`string` (ISO 8601)', desc: 'Timestamp the manifest was first created. Preserved across rewrites.' },
  updatedAt: { type: '`string` (ISO 8601)', desc: 'Timestamp of the most recent write.' },
  agents: { type: '`string[]`', desc: 'Agent IDs for which dxai has installed something.' },
  mcp: { type: '`{ [agentId]: { [serverId]: { addedAt, configPath } } }`', desc: 'Per-agent record of installed MCP servers. `addedAt` is ISO 8601; `configPath` points at the file dxai wrote into.' },
  skills: { type: '`{ [skillId]: { addedAt, path } }`', desc: 'Installed agent skills. `path` is the directory containing the skill on disk.' },
  files: { type: '`[{ relativePath, addedAt }]`', desc: 'Project files dxai created (`AGENTS.md`, `.cursor/rules/*.mdc`, etc.). Used by `dxai-cli status` to detect deletion.' },
};

export default function generate() {
  const empty = emptyManifest();
  const sections = [];

  sections.push(
    'Two manifest files capture what dxai installed:',
    '',
    `- **System** — \`~/.dxai/manifest.json\` (path constant: \`${SYSTEM_MANIFEST_PATH.replace(process.env.HOME || '', '~')}\`)`,
    `- **Project** — \`./${PROJECT_MANIFEST_PATH}\` (relative to the project where you ran dxai)`,
    '',
    'Both files share the same shape and are written by the helpers in `src/manifest.js`. `dxai-cli list`, `dxai-cli status`, `dxai-cli doctor`, and `dxai-cli cleanup` all read these.',
    '',
  );

  sections.push('## Fields');
  sections.push('');
  const rows = Object.keys(empty).map((k) => {
    const meta = FIELD_DOCS[k] || { type: '—', desc: '—' };
    return ['`' + k + '`', meta.type, meta.desc];
  });
  sections.push(mdTable(['Key', 'Type', 'Description'], rows));
  sections.push('');

  sections.push('## Empty manifest');
  sections.push('');
  sections.push('A fresh manifest (before any installs) has the shape:');
  sections.push('');
  sections.push('```json');
  sections.push(JSON.stringify(empty, null, 2));
  sections.push('```');
  sections.push('');

  sections.push('## Populated example');
  sections.push('');
  sections.push('After `dxai-cli system --agents cursor --mcp github,playwright`:');
  sections.push('');
  sections.push('```json');
  sections.push(JSON.stringify({
    version: MANIFEST_VERSION,
    createdAt: '2026-04-26T00:00:00.000Z',
    updatedAt: '2026-04-26T00:00:00.000Z',
    agents: ['cursor'],
    mcp: {
      cursor: {
        github: { addedAt: '2026-04-26T00:00:00.000Z', configPath: '/Users/you/.cursor/mcp.json' },
        playwright: { addedAt: '2026-04-26T00:00:00.000Z', configPath: '/Users/you/.cursor/mcp.json' },
      },
    },
    skills: {},
    files: [],
  }, null, 2));
  sections.push('```');

  writePage({
    relativePath: 'reference/manifest-schema.md',
    frontmatter: {
      title: 'Manifest Schema',
      description: `Fields written to ~/.dxai/manifest.json and ./.dxai/manifest.json. Schema version ${MANIFEST_VERSION}.`,
    },
    sourceLabel: 'src/manifest.js (emptyManifest) — generator: scripts/docs/gen-manifest-schema.mjs',
    body: sections.join('\n'),
  });
}
