/// <reference types="vitest" />

import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    plugins: [angular()],
    cacheDir: `../../node_modules/.vitest`,
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      passWithNoTests: true,
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
