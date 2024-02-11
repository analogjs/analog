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
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cache: {
        dir: `../../node_modules/.vitest/vite-plugin-angular`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
