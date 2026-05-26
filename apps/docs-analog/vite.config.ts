/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';

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
    }),
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
