// Registry catalogue validation.
//
// These tests are the self-running safety net for the catalogue: they fail in CI
// the moment an entry is malformed, so a typo never reaches a user's machine.
//   - Structural validation of every catalogue file (ids, category refs, shapes).
//   - A golden table that locks the canonical-transport → per-agent derivation
//     (renderAgentConfig) to the exact blocks the catalogue used to hand-write.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MCP_SERVERS, MCP_CATEGORIES, deriveConfigs } from '../src/registry/mcp-servers.js';
import { SKILLS, SKILL_CATEGORIES } from '../src/registry/skills.js';
import { AUTOMATION_TOOLS, AUTOMATION_TOOL_CATEGORIES } from '../src/registry/automation-tools.js';
import { AGENT_DEFINITIONS, renderAgentConfig } from '../src/detect.js';

// ── Generic structural checks, run against each catalogue ──
const CATALOGUES = [
  { label: 'mcp-servers', items: MCP_SERVERS, categories: MCP_CATEGORIES },
  { label: 'skills', items: SKILLS, categories: SKILL_CATEGORIES },
  { label: 'automation-tools', items: AUTOMATION_TOOLS, categories: AUTOMATION_TOOL_CATEGORIES },
];

for (const { label, items, categories } of CATALOGUES) {
  test(`${label}: entries are well-formed`, () => {
    assert.ok(Array.isArray(items) && items.length > 0, `${label} has entries`);
    const categoryIds = new Set(categories.map((c) => c.id));
    const seen = new Set();

    for (const item of items) {
      assert.equal(typeof item.id, 'string', `${label}: id is a string`);
      // ids are interpolated into config keys, TOML section headers, and CLI
      // argv — constrain them to a safe slug so a malformed entry can't inject
      // structure into a generated config (see renderAgentConfig).
      assert.match(
        item.id,
        /^[a-z0-9][a-z0-9-]*$/,
        `${label}: id "${item.id}" must be a lowercase slug ([a-z0-9-], no leading hyphen)`
      );
      assert.ok(!seen.has(item.id), `${label}: duplicate id "${item.id}"`);
      seen.add(item.id);

      assert.equal(typeof item.name, 'string', `${label}/${item.id}: name is a string`);
      assert.equal(typeof item.description, 'string', `${label}/${item.id}: has a description`);
      assert.ok(
        categoryIds.has(item.category),
        `${label}/${item.id}: category "${item.category}" is not a known category`
      );
    }
  });
}

// ── MCP-specific checks ──
test('mcp-servers: requiresEnv / requiresInput shapes are well-formed', () => {
  for (const server of MCP_SERVERS) {
    if (server.requiresEnv !== undefined) {
      assert.equal(typeof server.requiresEnv, 'object', `${server.id}: requiresEnv is an object`);
      for (const [key, desc] of Object.entries(server.requiresEnv)) {
        assert.ok(key.length > 0, `${server.id}: requiresEnv key is non-empty`);
        assert.equal(typeof desc, 'string', `${server.id}: requiresEnv["${key}"] description is a string`);
      }
    }
    if (server.requiresInput !== undefined) {
      assert.equal(typeof server.requiresInput, 'object', `${server.id}: requiresInput is an object`);
      for (const [key, def] of Object.entries(server.requiresInput)) {
        assert.equal(typeof def, 'object', `${server.id}: requiresInput["${key}"] is an object`);
        assert.equal(typeof def.prompt, 'string', `${server.id}: requiresInput["${key}"].prompt is a string`);
      }
    }
    if (server.stale) {
      assert.equal(typeof server.staleReason, 'string', `${server.id}: stale entries must carry a staleReason`);
    }
  }
});

test('mcp-servers: every server resolves to a config for at least one agent', () => {
  const agentIds = new Set(AGENT_DEFINITIONS.map((a) => a.id));
  for (const server of MCP_SERVERS) {
    const configuredAgents = Object.keys(server.configs || {});
    assert.ok(
      configuredAgents.length > 0,
      `${server.id}: resolves to no per-agent config — declare a transport or explicit configs`
    );
    // Every config key must target a real agent (catches typos like "antigravty").
    for (const agentId of configuredAgents) {
      assert.ok(
        agentIds.has(agentId),
        `${server.id}: config targets unknown agent "${agentId}"`
      );
    }
  }
});

test('mcp-servers: transport-based servers cover every agent dialect', () => {
  // A canonical transport should derive a block for every agent (minus any the
  // server explicitly opts out of) — proving the "add a server once, support
  // every agent" guarantee for migrated entries.
  const transportServers = MCP_SERVERS.filter((s) => s.transport);
  assert.ok(transportServers.length > 0, 'at least one server uses canonical transport');
  for (const server of transportServers) {
    const derived = deriveConfigs({ ...server, configs: undefined });
    const expected = AGENT_DEFINITIONS.length - (server.excludeAgents || []).length;
    assert.equal(
      Object.keys(derived).length,
      expected,
      `${server.id}: transport derives ${Object.keys(derived).length} agents, expected ${expected}`
    );
    for (const id of server.excludeAgents || []) assert.ok(!(id in derived), `${server.id}: excluded agent ${id} was derived`);
  }
});

test('mcp-servers: every catalogue entry declares a transport (no hand-written dialect blocks left)', () => {
  // Explicit `configs` blocks bypass derivation and rot when a vendor changes
  // its dialect (this is how the Codex $VAR and Cursor ${VAR} bugs shipped).
  for (const server of MCP_SERVERS) {
    assert.ok(server.transport || server.registry, `${server.id}: needs a transport (or a registry link that resolves one)`);
  }
});

test('mcp-servers: project configs use the project dialect where one exists', () => {
  const ctx7 = MCP_SERVERS.find((s) => s.id === 'context7');
  // Claude Code: CLI argv globally, plain JSON with type/url in .mcp.json.
  assert.equal(ctx7.configs['claude-code'].command, 'claude');
  assert.deepEqual(ctx7.projectConfigs['claude-code'], { type: 'http', url: ctx7.transport.url });
  // Codex: same TOML block in both places.
  assert.deepEqual(ctx7.projectConfigs.codex, ctx7.configs.codex);
  // Agents without a project file have no project block.
  assert.equal(ctx7.projectConfigs.antigravity, undefined);
});

// ── Golden derivation table ──
// These expected blocks are the exact shapes the catalogue hand-wrote before the
// transport refactor. If renderAgentConfig ever drifts from them, this fails —
// the de-risker that lets us migrate servers to `transport` with confidence.
const HTTP_SERVER = { id: 'context7', transport: { type: 'http', url: 'https://mcp.context7.com/mcp' } };
const STDIO_SERVER = {
  id: 'sequential-thinking',
  transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
};
const STDIO_ENV_SERVER = {
  id: 'gitlab',
  requiresEnv: { GITLAB_TOKEN: 'GitLab Personal Access Token' },
  transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-gitlab'] },
};

const agent = (id) => AGENT_DEFINITIONS.find((a) => a.id === id);

// Each row is the vendor-documented shape (see the `docs` URLs on the agent
// definition). Change a row only after re-verifying against those docs.
const URL = 'https://mcp.context7.com/mcp';
const ST_ARGS = ['-y', '@modelcontextprotocol/server-sequential-thinking'];
const GL_ARGS = ['-y', '@modelcontextprotocol/server-gitlab'];
const GOLDEN = [
  // HTTP — one URL, many key names; `type` only where the agent's schema requires it.
  ['cursor', HTTP_SERVER, { url: URL }],
  ['vscode', HTTP_SERVER, { type: 'http', url: URL }],
  ['vscode-insiders', HTTP_SERVER, { type: 'http', url: URL }],
  ['gemini', HTTP_SERVER, { httpUrl: URL }],
  ['devin-desktop', HTTP_SERVER, { url: URL }],
  ['devin-cli', HTTP_SERVER, { url: URL }],
  ['antigravity', HTTP_SERVER, { serverUrl: URL }],
  ['antigravity-ide', HTTP_SERVER, { serverUrl: URL }],
  ['antigravity-cli', HTTP_SERVER, { serverUrl: URL }],
  ['claude-code', HTTP_SERVER, {
    command: 'claude',
    args: ['mcp', 'add', '--scope', 'user', '--transport', 'http', 'context7', URL],
  }],
  ['codex', HTTP_SERVER, { toml: '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"' }],

  // stdio — no env.
  ['cursor', STDIO_SERVER, { type: 'stdio', command: 'npx', args: ST_ARGS }],
  ['vscode', STDIO_SERVER, { type: 'stdio', command: 'npx', args: ST_ARGS }],
  ['gemini', STDIO_SERVER, { command: 'npx', args: ST_ARGS }],
  ['devin-desktop', STDIO_SERVER, { command: 'npx', args: ST_ARGS }],
  ['antigravity', STDIO_SERVER, { command: 'npx', args: ST_ARGS }],
  ['claude-code', STDIO_SERVER, {
    command: 'claude',
    args: ['mcp', 'add', '--scope', 'user', '--transport', 'stdio', 'sequential-thinking', '--', 'npx', ...ST_ARGS],
  }],
  ['codex', STDIO_SERVER, {
    toml: '[mcp_servers.sequential-thinking]\ncommand = "npx"\nargs = ["-y", "@modelcontextprotocol/server-sequential-thinking"]',
  }],

  // stdio — with env, rendered per dialect:
  //   ${env:VAR} where the agent interpolates VS Code-style (Cursor, VS Code, Devin)
  //   ${VAR}     where it interpolates POSIX-style (Gemini CLI)
  //   ${VAR}     placeholder for agents with no interpolation — substituted at write time (Antigravity)
  //   env_vars   for Codex, which forwards named variables and never interpolates
  //   --env      for Claude Code, resolved at run time (nothing expands at user scope)
  ['cursor', STDIO_ENV_SERVER, { type: 'stdio', command: 'npx', args: GL_ARGS, env: { GITLAB_TOKEN: '${env:GITLAB_TOKEN}' } }],
  ['vscode', STDIO_ENV_SERVER, { type: 'stdio', command: 'npx', args: GL_ARGS, env: { GITLAB_TOKEN: '${env:GITLAB_TOKEN}' } }],
  ['devin-desktop', STDIO_ENV_SERVER, { command: 'npx', args: GL_ARGS, env: { GITLAB_TOKEN: '${env:GITLAB_TOKEN}' } }],
  ['gemini', STDIO_ENV_SERVER, { command: 'npx', args: GL_ARGS, env: { GITLAB_TOKEN: '${GITLAB_TOKEN}' } }],
  ['antigravity-cli', STDIO_ENV_SERVER, { command: 'npx', args: GL_ARGS, env: { GITLAB_TOKEN: '${GITLAB_TOKEN}' } }],
  ['codex', STDIO_ENV_SERVER, {
    toml: '[mcp_servers.gitlab]\ncommand = "npx"\nargs = ["-y", "@modelcontextprotocol/server-gitlab"]\nenv_vars = ["GITLAB_TOKEN"]',
  }],
  ['claude-code', STDIO_ENV_SERVER, {
    command: 'claude',
    args: ['mcp', 'add', '--scope', 'user', '--env', 'GITLAB_TOKEN=${GITLAB_TOKEN}', '--transport', 'stdio', 'gitlab', '--', 'npx', ...GL_ARGS],
  }],
];

// Project-level dialects (only where they differ from the global one).
const PROJECT_GOLDEN = [
  ['claude-code', HTTP_SERVER, { type: 'http', url: URL }],
  ['claude-code', STDIO_ENV_SERVER, { type: 'stdio', command: 'npx', args: GL_ARGS, env: { GITLAB_TOKEN: '${GITLAB_TOKEN}' } }],
];
for (const [agentId, server, expected] of PROJECT_GOLDEN) {
  test(`derive (project): ${server.transport.type} → ${agentId} (${server.id})`, () => {
    assert.deepEqual(renderAgentConfig(agent(agentId), server, { project: true }), expected);
  });
}

for (const [agentId, server, expected] of GOLDEN) {
  test(`derive: ${server.transport.type} → ${agentId} (${server.id})`, () => {
    assert.deepEqual(renderAgentConfig(agent(agentId), server), expected);
  });
}

test('renderAgentConfig: returns null without a transport or dialect', () => {
  assert.equal(renderAgentConfig(agent('cursor'), { id: 'x' }), null);
  assert.equal(renderAgentConfig({ id: 'noop' }, HTTP_SERVER), null);
});

test('deriveConfigs: a legacy `antigravity` block fans out to every Antigravity agent', () => {
  const block = { command: 'npx', args: ['-y', 'pkg'] };
  const configs = deriveConfigs({ id: 'legacy', configs: { antigravity: block } });
  assert.deepEqual(configs, {
    antigravity: block,
    'antigravity-ide': block,
    'antigravity-cli': block,
  });
});

test('deriveConfigs: a legacy `windsurf` block reaches both Devin agents', () => {
  const block = { command: 'npx', args: ['-y', 'pkg'] };
  const configs = deriveConfigs({ id: 'legacy', configs: { windsurf: block } });
  assert.deepEqual(configs, { 'devin-desktop': block, 'devin-cli': block });
});

test('deriveConfigs: excludeAgents drops agents from derivation (and accepts former ids)', () => {
  const configs = deriveConfigs({ ...HTTP_SERVER, excludeAgents: ['claude-code', 'windsurf'] });
  assert.ok(!('claude-code' in configs));
  assert.ok(!('devin-desktop' in configs));
  assert.ok('cursor' in configs);
});

test('deriveConfigs: an explicit per-agent block beats the `antigravity` alias', () => {
  const shared = { command: 'npx', args: ['-y', 'pkg'] };
  const ideOnly = { command: 'npx', args: ['-y', 'ide-pkg'] };
  const configs = deriveConfigs({ id: 'legacy', configs: { antigravity: shared, 'antigravity-ide': ideOnly } });
  assert.deepEqual(configs['antigravity-ide'], ideOnly);
  assert.deepEqual(configs.antigravity, shared);
  assert.deepEqual(configs['antigravity-cli'], shared);
});
