/// <reference types="vitest" />

import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    plugins: [angular(), nxViteTsPaths()],
    optimizeDeps: {
      include: ['@angular/cdk/testing/testbed'],
      exclude: ['@angular/cdk/testing'],
    },
    ssr: {
      noExternal: [/cdk\/fesm/],
    },
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cacheDir: '../../node_modules/.vitest',
      pool: 'vmForks',
      fileParallelism: false,
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
