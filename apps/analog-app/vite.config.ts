/// <reference types="vitest" />

import { defineConfig } from 'vite';
import angular from '../../packages/vite-plugin-angular/src';
import { offsetFromRoot } from '@nrwl/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  console.log(mode);
  return {
    root: 'src',
    build: {
      outDir: `${offsetFromRoot('apps/analog-app/src')}/dist/apps/analog-app`,
      emptyOutDir: true,
    },
    resolve: {
      mainFields: ['module'],
    },
    plugins: [
      mode !== 'test'
        ? angular({ mode, tsconfig: './tsconfig.app.json' })
        : undefined,
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['test-setup.ts'],
      include: ['**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
