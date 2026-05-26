/// <reference types="vitest" />

import analog from '@analogjs/platform';
import tailwindcss from '@tailwindcss/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';
import { admonitionExtension } from './src/app/marked/admonition';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  publicDir: 'src/public',
  build: {
    outDir: '../../dist/apps/docs-analog/client',
    reportCompressedSize: true,
    target: ['es2020'],
  },
  plugins: [
    analog({
      static: true,
      prerender: {
        routes: ['/'],
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
          extensions: [admonitionExtension],
        },
      },
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
