// Generate changelog.md from git log. Supports both conventional commits
// (feat:, fix:, chore:, docs:, refactor:, test:, ci:, perf:) and free-form
// commit subjects, which fall into an "Other changes" bucket.
//
// Commits are grouped by the tag they belong to, if any. Untagged commits go
// under "Unreleased".

import { execSync } from 'node:child_process';
import { writePage } from './lib/render.mjs';

const REPO = 'nandha-kumar-hajari/dxai';
const TYPES = [
  { key: 'feat', label: 'Features' },
  { key: 'fix', label: 'Bug fixes' },
  { key: 'perf', label: 'Performance' },
  { key: 'refactor', label: 'Refactor' },
  { key: 'docs', label: 'Documentation' },
  { key: 'test', label: 'Tests' },
  { key: 'ci', label: 'CI / build' },
  { key: 'chore', label: 'Chores' },
  { key: 'other', label: 'Other changes' },
];

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function parseCommit(line) {
  // Format: "<sha>\x1f<subject>"
  const [sha, subject] = line.split('\x1f');
  if (!sha || !subject) return null;
  const m = subject.match(/^(\w+)(?:\([^)]+\))?!?:\s*(.+)$/);
  let type = 'other';
  let title = subject;
  if (m) {
    const candidate = m[1].toLowerCase();
    if (TYPES.some((t) => t.key === candidate)) {
      type = candidate;
      title = m[2];
    }
  }
  return { sha, type, title };
}

function commitsForRange(range) {
  const out = git(`log ${range} --format=%H%x1f%s`);
  if (!out) return [];
  return out.split('\n').map(parseCommit).filter(Boolean);
}

function tagsSorted() {
  // --sort=-creatordate gives newest first.
  const out = git('tag --sort=-creatordate');
  return out ? out.split('\n').filter(Boolean) : [];
}

function renderGroup(label, commits) {
  if (commits.length === 0) return null;
  const lines = [`### ${label}`, ''];
  for (const c of commits) {
    const short = c.sha.slice(0, 7);
    const url = `https://github.com/${REPO}/commit/${c.sha}`;
    lines.push(`- ${c.title} ([\`${short}\`](${url}))`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderRelease(heading, commits) {
  const sections = [`## ${heading}`, ''];
  let any = false;
  for (const t of TYPES) {
    const matches = commits.filter((c) => c.type === t.key);
    const block = renderGroup(t.label, matches);
    if (block) {
      sections.push(block);
      any = true;
    }
  }
  if (!any) {
    sections.push('_No changes._');
    sections.push('');
  }
  return sections.join('\n');
}

export default function generate() {
  const tags = tagsSorted();
  const sections = ['Auto-generated from git history. Conventional-commit prefixes (`feat:`, `fix:`, `chore:`, etc.) are grouped; everything else lands under "Other changes".', ''];

  if (tags.length === 0) {
    // No tags yet — show all commits as "Unreleased".
    const commits = commitsForRange('--all');
    sections.push(renderRelease('Unreleased', commits));
  } else {
    // Commits since the most recent tag are "Unreleased".
    const head = tags[0];
    const unreleased = commitsForRange(`${head}..HEAD`);
    if (unreleased.length > 0) {
      sections.push(renderRelease('Unreleased', unreleased));
    }

    // Each tag pair becomes a release.
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const next = tags[i + 1];
      const range = next ? `${next}..${tag}` : tag;
      const commits = commitsForRange(range);
      const date = git(`log -1 --format=%ad --date=short ${tag}`);
      const heading = date ? `${tag} — ${date}` : tag;
      sections.push(renderRelease(heading, commits));
    }
  }

  writePage({
    relativePath: 'changelog.md',
    frontmatter: {
      title: 'Changelog',
      description: 'Auto-generated from git history. Grouped by conventional-commit type.',
    },
    sourceLabel: 'git log (generator: scripts/docs/gen-changelog.mjs)',
    body: sections.join('\n'),
  });
}
