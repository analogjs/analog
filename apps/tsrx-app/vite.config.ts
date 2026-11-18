/// <reference types="vitest" />

import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import nitro from '@analogjs/vite-plugin-nitro';
import { tsrx } from '@analogjs/tsrx-angular';
import { defineConfig } from 'vite';

// Demo app for TSRX components (`.tsrx`) in Analog. TSRX compiles through the
// fast compile path, so `angular()` runs with `fastCompile: true`.
export default defineConfig(() => {
  return {
    root: import.meta.dirname,
    publicDir: 'src/assets',
    optimizeDeps: {
      include: ['@angular/common'],
    },
    build: {
      outDir: '../../dist/apps/tsrx-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    plugins: [
      analog({
        content: { highlighter: 'shiki' },
        prerender: {
          routes: ['/', '/blog', '/blog/tsrx-in-analog'],
        },
      }),
      tsrx(),
      angular({ fastCompile: true }),
      nitro(),
    ],
  };
});
