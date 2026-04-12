/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
import { getWorkspaceDependencyExcludes } from '../../tools/vite/get-workspace-dependency-excludes.js';

export default defineConfig(() => {
  return {
    root: __dirname,
    publicDir: 'src/assets',
    optimizeDeps: {
      include: ['@angular/common'],
      // Keep workspace Angular libraries on the source-transform path so Analog
      // can compile external templates/styles instead of Vite prebundling them.
      exclude: getWorkspaceDependencyExcludes(__dirname),
    },
    build: {
      outDir: '../../dist/apps/opt-catchall-app/client',
      emptyOutDir: true,
      reportCompressedSize: true,
      target: ['es2020'],
    },
    plugins: [
      analog({
        liveReload: true,
        experimental: {
          useAngularCompilationAPI: true,
        },
        content: {
          highlighter: 'shiki',
        },
      }),
    ],
  };
});
