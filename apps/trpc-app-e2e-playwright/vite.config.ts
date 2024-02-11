/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { offsetFromRoot } from '@nx/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'tests',
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'node',
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${offsetFromRoot(
          'apps/trpc-app-e2e-playwright'
        )}/node_modules/.vitest/trpc-app-e2e-playwright`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
