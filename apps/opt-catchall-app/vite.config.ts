/// <reference types="vitest" />

import analog from '@analogjs/platform';
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
