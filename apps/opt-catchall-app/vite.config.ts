/// <reference types="vitest" />

import analog from '@analogjs/platform';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    root: import.meta.dirname,
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
      viteTsConfigPaths(),
    ],
  };
});
