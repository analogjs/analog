/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, Plugin, splitVendorChunkPlugin } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'apps/analog-app/src',
    optimizeDeps: {
      include: ['@angular/common', '@angular/forms'],
      force: true,
    },
    build: {
      target: ['es2020'],
    },
    resolve: {
      mainFields: ['module'],
    },
    plugins: [
      analog({
        vite: {
          inlineStylesExtension: 'scss',
          tsconfig: 'apps/analog-app/tsconfig.app.json',
        },
        nitro: {
          rootDir: `apps/analog-app/src`,
          output: {
            dir: `../../../../dist/apps/analog-app/server`,
          },
          buildDir: `../../../dist/apps/analog-app/.nitro`,
        },
      }),
      visualizer() as Plugin,
      splitVendorChunkPlugin(),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['test-setup.ts'],
      include: ['apps/analog-app/**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
