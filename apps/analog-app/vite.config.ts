/// <reference types="vitest" />

import { defineConfig } from 'vite';
import angular from '../../packages/vite-plugin-angular/src';
import { offsetFromRoot } from '@nrwl/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  root: 'src',
  optimizeDeps: {
    exclude: ['rxjs'],
  },
  build: {
    outDir: `${offsetFromRoot('apps/analog-app/src')}/dist/apps/analog-app`,
    emptyOutDir: true,
  },
  resolve: {
    mainFields: ['module'],
  },

  plugins: [
    mode !== 'test' ? angular(): undefined
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['test-setup.ts'],
    include: ['**/*.spec.ts'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
