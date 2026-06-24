/// <reference types="vitest" />

import { resolve } from 'node:path';
import analog from '@analogjs/platform';
import tailwindcss from '@tailwindcss/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';
import {
  brokenLinksPlugin,
  copyMarkdownPlugin,
  llmsTxtPlugin,
  sitemapPlugin,
} from '@analogjs/content/docs/vite';
import { admonitionExtension } from './src/app/marked/admonition';
import { mdxTabsExtension } from './src/app/marked/tabs';

const REPO_ROOT = resolve(__dirname, '../..');
const CONTENT_DIR = resolve(__dirname, 'src/content');
const CLIENT_DIST = resolve(REPO_ROOT, 'dist/apps/docs-analog/client');
const SITE_URL = 'https://analogjs.org';
const NON_DEFAULT_LOCALES = ['de', 'es', 'pt-br', 'zh-hans'] as const;

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
    }),
    llmsTxtPlugin({
      siteUrl: SITE_URL,
      siteName: 'Analog',
      contentDir: CONTENT_DIR,
      distDir: CLIENT_DIST,
      skipLocales: NON_DEFAULT_LOCALES,
    }),
    brokenLinksPlugin({ distDir: CLIENT_DIST }),
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
