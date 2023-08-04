/// <reference types="vitest" />

import { offsetFromRoot } from '@nx/devkit/src/utils/offset-from-root.js';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    test: {
      globals: true,
      environment: 'node',
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${offsetFromRoot(
          'packages/astro-app-e2e-playwright'
        )}/node_modules/.vitest/astro-app-e2e-playwright`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
