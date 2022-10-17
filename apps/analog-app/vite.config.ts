/// <reference types="vitest" />

import { defineConfig, Plugin, splitVendorChunkPlugin } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import angular from '@analogjs/vite-plugin-angular';
import { offsetFromRoot } from '@nrwl/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'src',
    server: {
      port: 3000,
    },
    optimizeDeps: {
      include: ['@angular/common', '@angular/forms'],
    },
    build: {
      outDir: `${offsetFromRoot('apps/analog-app/src')}/dist/apps/analog-app`,
      emptyOutDir: true,
      target: 'es2020',
    },
    resolve: {
      mainFields: ['module'],
    },
    plugins: [
      angular({
        inlineStylesExtension: 'scss',
      }),
      visualizer() as Plugin,
      splitVendorChunkPlugin(),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['test-setup.ts'],
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${offsetFromRoot('apps/analog-app/src')}/node_modules/.vitest`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
