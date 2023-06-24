/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { offsetFromRoot } from '@nx/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'tests',
    test: {
      globals: true,
      environment: 'node',
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${offsetFromRoot(
          'apps/create-analog-e2e'
        )}/node_modules/.vitest/create-analog-e2e`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
