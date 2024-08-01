/// <reference types="vitest" />

import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    cacheDir: `../../node_modules/.vitest/vite-plugin-angular`,
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'node',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
