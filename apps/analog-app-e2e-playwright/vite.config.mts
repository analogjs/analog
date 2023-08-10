/// <reference types="vitest" />

import { defineConfig } from 'vite';
import nx from '@nx/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'tests',
    test: {
      globals: true,
      environment: 'node',
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${nx.offsetFromRoot(
          'apps/analog-app-e2e-playwright'
        )}/node_modules/.vitest/analog-app-e2e-playwright`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
