/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { offsetFromRoot } from '@nx/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'src',
    test: {
      globals: true,
      include: ['**/*.spec.ts'],
      exclude: ['**/files/**/*.spec.ts'],
      cache: {
        dir: `${offsetFromRoot('packages/nx-plugin/src')}/node_modules/.vitest`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
