/// <reference types="vitest" />

import analog from '@analogjs/platform';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { getWorkspaceDependencyExcludes } from '../../tools/vite/get-workspace-dependency-excludes.js';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    publicDir: 'src/public',
    build: {
      outDir: '../../dist/apps/tanstack-query-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    optimizeDeps: {
      include: ['@angular/forms'],
      // Keep workspace Angular libraries on the source-transform path so Analog
      // can compile external templates/styles instead of Vite prebundling them.
      exclude: getWorkspaceDependencyExcludes(__dirname),
    },
    plugins: [
      tailwindcss(),
      analog({
        apiPrefix: 'api',
      }),
    ],
    test: {
      reporters: ['default'],
      coverage: {
        reportsDirectory: '../../coverage/apps/tanstack-query-app',
        provider: 'v8',
      },
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      passWithNoTests: true,
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
