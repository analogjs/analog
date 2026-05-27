/// <reference types="vitest" />

import analog from '@analogjs/platform';
import tailwindcss from '@tailwindcss/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';
import { admonitionExtension } from './src/app/marked/admonition';
import { mdxTabsExtension } from './src/app/marked/tabs';
import { contributingCopyPlugin } from './src/vite-plugins/contributing';
import { packageReadmesPlugin } from './src/vite-plugins/package-readmes';
import { sitemapPlugin } from './src/vite-plugins/sitemap';
import { brokenLinksPlugin } from './src/vite-plugins/broken-links';
import { llmsTxtPlugin } from './src/vite-plugins/llms-txt';

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
    contributingCopyPlugin(),
    packageReadmesPlugin(),
    sitemapPlugin(),
    llmsTxtPlugin(),
    brokenLinksPlugin(),
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
