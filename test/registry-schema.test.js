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
  // A canonical transport should derive a block for all 8 agents — proving the
  // "add a server once, support every agent" guarantee for migrated entries.
  const transportServers = MCP_SERVERS.filter((s) => s.transport);
  assert.ok(transportServers.length > 0, 'at least one server uses canonical transport');
  for (const server of transportServers) {
    const derived = deriveConfigs({ ...server, configs: undefined });
    assert.equal(
      Object.keys(derived).length,
      AGENT_DEFINITIONS.length,
      `${server.id}: transport derives ${Object.keys(derived).length} agents, expected ${AGENT_DEFINITIONS.length}`
    );
  }
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

const GOLDEN = [
  // HTTP — one URL, many key names.
  ['cursor', HTTP_SERVER, { url: 'https://mcp.context7.com/mcp' }],
  ['vscode', HTTP_SERVER, { url: 'https://mcp.context7.com/mcp' }],
  ['gemini', HTTP_SERVER, { httpUrl: 'https://mcp.context7.com/mcp' }],
  ['windsurf', HTTP_SERVER, { serverUrl: 'https://mcp.context7.com/mcp' }],
  ['antigravity-ide', HTTP_SERVER, { serverUrl: 'https://mcp.context7.com/mcp' }],
  ['claude-code', HTTP_SERVER, {
    command: 'claude',
    args: ['mcp', 'add', 'context7', '--transport', 'http', 'https://mcp.context7.com/mcp'],
  }],
  ['codex', HTTP_SERVER, { toml: '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"' }],

  // stdio — no env.
  ['cursor', STDIO_SERVER, { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] }],
  ['gemini', STDIO_SERVER, { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] }],
  ['claude-code', STDIO_SERVER, {
    command: 'claude',
    args: ['mcp', 'add', 'sequential-thinking', '--', 'npx', '-y', '@modelcontextprotocol/server-sequential-thinking'],
  }],
  ['codex', STDIO_SERVER, {
    toml: '[mcp_servers.sequential-thinking]\ncommand = "npx"\nargs = ["-y", "@modelcontextprotocol/server-sequential-thinking"]',
  }],

  // stdio — with env (rendered per dialect: ${VAR} for JSON, $VAR for TOML).
  ['cursor', STDIO_ENV_SERVER, {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gitlab'],
    env: { GITLAB_TOKEN: '${GITLAB_TOKEN}' },
  }],
  ['codex', STDIO_ENV_SERVER, {
    toml: '[mcp_servers.gitlab]\ncommand = "npx"\nargs = ["-y", "@modelcontextprotocol/server-gitlab"]\n\n[mcp_servers.gitlab.env]\nGITLAB_TOKEN = "$GITLAB_TOKEN"',
  }],
];

for (const [agentId, server, expected] of GOLDEN) {
  test(`derive: ${server.transport.type} → ${agentId} (${server.id})`, () => {
    assert.deepEqual(renderAgentConfig(agent(agentId), server), expected);
  });
}

test('renderAgentConfig: returns null without a transport or dialect', () => {
  assert.equal(renderAgentConfig(agent('cursor'), { id: 'x' }), null);
  assert.equal(renderAgentConfig({ id: 'noop' }, HTTP_SERVER), null);
});
