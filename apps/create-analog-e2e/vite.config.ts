/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { offsetFromRoot } from '@nx/devkit';

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
