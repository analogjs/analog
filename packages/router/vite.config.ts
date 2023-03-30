/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { offsetFromRoot } from '@nrwl/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'src',
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${offsetFromRoot('packages/router/src')}/node_modules/.vitest`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
