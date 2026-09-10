// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';
import icon from 'astro-icon';

export default defineConfig({
  site: 'https://dxai.dev',
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
        'Interactive CLI to bootstrap your AI-powered dev environment — MCP servers, agent skills, cursor rules and more across Cursor, Claude Code, Codex, Gemini CLI, VS Code, Antigravity, and Devin Desktop.',
      logo: { src: './src/assets/dxai-logo.png', alt: 'dxai' },
      favicon: '/favicon-512.png',
      head: [
        // Apple touch icon (home-screen bookmark).
        {
          tag: 'link',
          attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        },
        // Open Graph / Twitter link-preview card. Absolute URLs are required by
        // crawlers — the full brand logo on a dark card.
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://dxai.dev/og.png' },
        },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: 'https://dxai.dev/og.png' },
        },
      ],
      customCss: [
        '@fontsource/ibm-plex-sans/400.css',
        '@fontsource/ibm-plex-sans/500.css',
        '@fontsource/ibm-plex-sans/600.css',
        '@fontsource/ibm-plex-mono/400.css',
        '@fontsource/ibm-plex-mono/500.css',
        '@fontsource/ibm-plex-mono/600.css',
        './src/styles/landing.css',
      ],
      components: {
        Hero: './src/components/Hero.astro',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/nandha-kumar-hajari/dxai' },
      ],
      editLink: {
        baseUrl: 'https://github.com/nandha-kumar-hajari/dxai/edit/main/docs/',
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
            { slug: 'reference/agents' },
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
