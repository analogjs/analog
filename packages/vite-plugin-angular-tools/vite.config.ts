/// <reference types="vitest" />

import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vitest',
    test: {
      reporters: ['default'],
      globals: true,
      include: ['**/*.spec.ts'],
      exclude: ['**/files/**/*.spec.ts'],
      testTimeout: 10000,
      passWithNoTests: true,
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
