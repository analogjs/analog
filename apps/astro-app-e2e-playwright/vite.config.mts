/// <reference types="vitest" />

import { defineConfig } from 'vite';
import nx from '@nx/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    test: {
      globals: true,
      environment: 'node',
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${nx.offsetFromRoot(
          'packages/astro-app-e2e-playwright'
        )}/node_modules/.vitest/astro-app-e2e-playwright`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
