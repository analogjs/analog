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
            additionalLangs: ['bash', 'json', 'toml'],
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
