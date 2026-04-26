// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';
import icon from 'astro-icon';

export default defineConfig({
  site: 'https://nandha-d3v.github.io',
  base: '/d3v-ai-cli',
  trailingSlash: 'ignore',
  integrations: [
    icon({
      include: {
        'simple-icons': [
          'cursor',
          'claude',
          'openai',
          'googlegemini',
          'visualstudiocode',
          'windsurf',
          'google',
        ],
      },
    }),
    starlight({
      title: 'dxai',
      description:
        'Interactive CLI to bootstrap your AI-powered dev environment — MCP servers, agent skills, cursor rules and more across Cursor, Claude Code, Codex, Gemini CLI, VS Code, Windsurf, and Antigravity.',
      logo: { src: './public/favicon.svg' },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/landing.css'],
      components: {
        Hero: './src/components/Hero.astro',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Nandha-d3v/d3v-ai-cli' },
      ],
      editLink: {
        baseUrl: 'https://github.com/Nandha-d3v/d3v-ai-cli/edit/main/docs/',
      },
      lastUpdated: true,
      plugins: [starlightLlmsTxt()],
      // Sidebar uses `autogenerate` for directories that get populated by
      // generators (commands, registry, etc.) so new pages show up without
      // manual config edits. Hand-written sections are explicit for ordering.
      sidebar: [
        {
          label: 'Guide',
          items: [
            { slug: 'guide/getting-started' },
            { slug: 'guide/installation' },
            { slug: 'guide/quick-start' },
            { slug: 'guide/non-interactive' },
            { slug: 'guide/profiles' },
            { slug: 'guide/introspection' },
            { slug: 'guide/troubleshooting' },
          ],
        },
        {
          label: 'CLI Reference',
          items: [
            { label: 'Commands', autogenerate: { directory: 'reference/commands' } },
            { slug: 'reference/flags' },
            { slug: 'reference/env-vars' },
            { slug: 'reference/config-files' },
            { slug: 'reference/profile-schema' },
            { slug: 'reference/manifest-schema' },
          ],
        },
        {
          label: 'Registry',
          autogenerate: { directory: 'registry' },
        },
        {
          label: 'Internals',
          autogenerate: { directory: 'internals' },
        },
        { label: 'Changelog', slug: 'changelog' },
      ],
    }),
  ],
});
