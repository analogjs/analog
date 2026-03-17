/// <reference types="vitest" />

import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/astro-angular',
    resolve: {
      mainFields: ['module'],
    },
    test: {
      reporters: ['default'],
      passWithNoTests: true,
      globals: true,
      setupFiles: [],
      include: ['**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
