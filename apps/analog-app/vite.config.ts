/// <reference types="vitest" />

import { defineConfig, splitVendorChunkPlugin } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import angular from '../../packages/vite-plugin-angular/src';
import { offsetFromRoot } from '@nrwl/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'src',
    build: {
      outDir: `${offsetFromRoot('apps/analog-app/src')}/dist/apps/analog-app`,
      emptyOutDir: true,
      target: 'es2020',
    },
    resolve: {
      mainFields: ['module'],
    },
    plugins: [angular(), visualizer(), splitVendorChunkPlugin()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['test-setup.ts'],
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${offsetFromRoot('apps/analog-app/src')}/node_modules/.vitest`
      }
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
