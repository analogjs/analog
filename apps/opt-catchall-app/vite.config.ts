/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    root: __dirname,
    publicDir: 'src/assets',
    optimizeDeps: {
      include: ['@angular/common'],
    },
    build: {
      outDir: '../../dist/apps/opt-catchall-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    plugins: [
      analog({
        liveReload: true,
        content: {
          highlighter: 'shiki',
        },
      }),
      nxViteTsPaths(),
    ],
  };
});
