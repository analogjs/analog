/// <reference types="vitest" />

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import analog from '../../packages/platform/src/index.js';
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
      exclude: getWorkspaceDependencyExcludes('apps/opt-catchall-app'),
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
      nxViteTsPaths(),
    ],
  };
});
