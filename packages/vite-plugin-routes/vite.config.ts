/// <reference types="vitest" />

import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vitest',
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'node',
      include: ['src/**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
