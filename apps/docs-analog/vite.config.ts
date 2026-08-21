/// <reference types="vitest" />

import { resolve } from 'node:path';
import analog from '@analogjs/platform';
import tailwindcss from '@tailwindcss/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';
import {
  admonitionExtension,
  agentResourcesPlugin,
  brokenLinksPlugin,
  copyMarkdownPlugin,
  llmsTxtPlugin,
  mdxTabsExtension,
  sitemapPlugin,
} from './vite/index';

const REPO_ROOT = resolve(__dirname, '../..');
const CONTENT_DIR = resolve(__dirname, 'src/content');
const CLIENT_DIST = resolve(REPO_ROOT, 'dist/apps/docs-analog/client');
const SITE_URL = 'https://analogjs.org';
const NON_DEFAULT_LOCALES = ['de', 'es', 'pt-br', 'zh-hans'] as const;

// Non-content pages included in sitemap.xml alongside the docs corpus.
const STATIC_ROUTES = ['/', '/about', '/contact', '/developers', '/privacy'];

// Agent-facing guidance at the top of llms.txt (llmstxt.org convention:
// summary blockquote first, then free-form markdown before the file list).
const LLMS_PREAMBLE = `
> Analog (AnalogJS) is the fullstack meta-framework for building Angular
> applications with Vite: file-based routing, server-side rendering (SSR),
> static site generation (SSG), API routes, and Markdown content support.

## When to use Analog

Reach for Analog when the job involves:

- Building a fullstack or content-driven web application with Angular — Analog
  adds file-based routing, SSR/SSG, and Nitro-powered API routes on top of
  Angular and Vite.
- Adding server-side rendering or static site generation to an Angular app.
- Writing server/API endpoints inside an Angular project (\`src/server/routes\`).
- Markdown-driven sites (blogs, docs) rendered with Angular components.
- Using Vite, Vitest, or Storybook with Angular via
  \`@analogjs/vite-plugin-angular\`, \`@analogjs/vitest-angular\`, and
  \`@analogjs/storybook-angular\`.
- Embedding Angular components as islands in Astro via
  \`@analogjs/astro-angular\`.

Analog is Angular-specific: for React, Vue, Svelte, or Solid projects use
their own meta-frameworks instead. Scaffold a new project with the official
CLI: \`npm create analog@latest\` (package \`create-analog\` on npm).

## How agents should read this site

- Every docs page is also served as raw Markdown at its URL plus \`.md\`
  (e.g. ${SITE_URL}/docs/introduction.md), or by sending
  \`Accept: text/markdown\` to the extension-less URL.
- JSON index of every page: ${SITE_URL}/api/v1/docs.json — one page as JSON:
  ${SITE_URL}/api/v1/docs/{slug}.json.
- OpenAPI description of all machine-readable endpoints:
  ${SITE_URL}/openapi.json.
- Whole corpus in one file: ${SITE_URL}/llms-full.txt — per-section indexes at
  ${SITE_URL}/docs/{section}/llms.txt.
- Unknown paths return real HTTP 404s (structured JSON errors under \`/api/\`),
  so existence checks are reliable.
- Developer portal: ${SITE_URL}/developers.
`;

export default defineConfig(({ mode }) => ({
  root: __dirname,
  build: {
    outDir: '../../dist/apps/docs-analog/client',
    reportCompressedSize: true,
    target: ['es2020'],
  },
  plugins: [
    analog({
      static: true,
      i18n: {
        defaultLocale: 'en',
        locales: ['en', 'de', 'es', 'pt-br', 'zh-hans'],
      },
      prerender: {
        discover: true,
        routes: [
          '/',
          {
            contentDir: '/src/content',
            recursive: true,
            transform: (file) => {
              const LOCALES = new Set(['de', 'es', 'pt-br', 'zh-hans']);
              const dir = (file.relativePath ?? '').split('/').filter(Boolean);
              const locale = dir.length && LOCALES.has(dir[0]) ? dir[0] : null;
              const rest = locale ? dir.slice(1) : dir;
              const tail =
                file.name === 'index'
                  ? rest.join('/')
                  : [...rest, file.name].join('/');
              if (!tail) return false;
              return locale ? `/${locale}/docs/${tail}` : `/docs/${tail}`;
            },
            // Emit the source Markdown beside each prerendered route so every
            // docs page is retrievable as raw Markdown at its `.md` URL.
            outputSourceFile: (file) => file.content,
          },
        ],
      },
      content: {
        highlighter: 'shiki',
        shikiOptions: {
          highlight: {
            themes: { light: 'github-light', dark: 'night-owl' },
          },
          highlighter: {
            additionalLangs: [
              'bash',
              'json',
              'jsonc',
              'toml',
              'yaml',
              'diff',
              'scss',
              'xml',
              'markdown',
            ],
            // Languages the corpus uses that aren't real shiki grammars
            // (treeview directory listings, mermaid diagrams, diff- variants).
            // skipLangs escapes the block as plain text without crashing.
            skipLangs: [
              'treeview',
              'mermaid',
              'diff-ts',
              'diff-typescript',
            ] as never,
          },
        },
        markedOptions: {
          extensions: [admonitionExtension, mdxTabsExtension],
        },
      },
    }),
    copyMarkdownPlugin({
      entries: [
        {
          src: resolve(REPO_ROOT, 'CONTRIBUTING.md'),
          dst: resolve(CONTENT_DIR, 'contributing.md'),
          frontmatterTitle: 'Contributing',
        },
        {
          src: resolve(REPO_ROOT, 'packages/astro-angular/README.md'),
          dst: resolve(CONTENT_DIR, 'packages/astro-angular/overview.md'),
          frontmatterTitle: 'Astro',
        },
        {
          src: resolve(REPO_ROOT, 'packages/router/README.md'),
          dst: resolve(CONTENT_DIR, 'packages/router/overview.md'),
          frontmatterTitle: 'Router',
        },
        {
          src: resolve(REPO_ROOT, 'packages/vite-plugin-angular/README.md'),
          dst: resolve(CONTENT_DIR, 'packages/vite-plugin-angular/overview.md'),
          frontmatterTitle: 'Vite',
        },
        {
          src: resolve(REPO_ROOT, 'packages/vite-plugin-nitro/README.md'),
          dst: resolve(CONTENT_DIR, 'packages/vite-plugin-nitro/overview.md'),
          frontmatterTitle: 'Nitro',
        },
      ],
    }),
    sitemapPlugin({
      siteUrl: SITE_URL,
      contentDir: CONTENT_DIR,
      distDir: CLIENT_DIST,
      locales: NON_DEFAULT_LOCALES,
      extraRoutes: STATIC_ROUTES,
    }),
    llmsTxtPlugin({
      siteUrl: SITE_URL,
      siteName: 'Analog',
      contentDir: CONTENT_DIR,
      distDir: CLIENT_DIST,
      skipLocales: NON_DEFAULT_LOCALES,
      preamble: LLMS_PREAMBLE,
    }),
    agentResourcesPlugin({
      siteUrl: SITE_URL,
      siteName: 'Analog',
      contentDir: CONTENT_DIR,
      distDir: CLIENT_DIST,
      skipLocales: NON_DEFAULT_LOCALES,
    }),
    brokenLinksPlugin({
      distDir: CLIENT_DIST,
      prerenderedRoutes: [...STATIC_ROUTES, '/docs/introduction'],
    }),
    tailwindcss(),
    nxViteTsPaths(),
  ],
  test: {
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/docs-analog',
      provider: 'v8',
    },
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    cache: {
      dir: `../../node_modules/.vitest`,
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
