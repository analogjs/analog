/// <reference types="vitest" />

import { offsetFromRoot } from '@nx/devkit';
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
