/// <reference types="vitest" />

import { defineConfig } from 'vite';
import nx from '@nx/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'src',
    server: {
      port: 3000,
    },
    build: {
      outDir: `${nx.offsetFromRoot(
        'packages/astro-angular/src'
      )}/dist/packages/astro-angular`,
      emptyOutDir: true,
      target: 'es2020',
    },
    resolve: {
      mainFields: ['module'],
    },
    plugins: [],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${nx.offsetFromRoot(
          'packages/astro-angular/src'
        )}/node_modules/.vitest`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
