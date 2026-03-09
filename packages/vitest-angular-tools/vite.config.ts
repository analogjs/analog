/// <reference types="vitest" />

import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    test: {
      reporters: ['default'],
      globals: true,
      include: ['**/*.spec.ts'],
      exclude: ['**/files/**/*.spec.ts'],
      cacheDir: '../../node_modules/.vitest',
      testTimeout: 10000,
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
