/// <reference types="vitest" />

import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  root: 'src',
  publicDir: 'assets',
  build: {
    outDir: `../dist/my-app`,
    emptyOutDir: true,
    target: 'es2020',
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['test.ts'],
    include: ['**/*.spec.ts'],
    cache: {
      dir: `../node_modules/.vitest`,
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
