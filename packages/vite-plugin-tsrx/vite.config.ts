/// <reference types="vitest" />

import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/vite-plugin-tsrx',
  test: {
    reporters: ['default'],
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts'],
  },
});
