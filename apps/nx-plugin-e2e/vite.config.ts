/// <reference types="vitest" />

import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'node',
      include: ['**/*.spec.ts'],
      cache: {
        dir: `../../node_modules/.vitest/nx-plugin-e2e`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
