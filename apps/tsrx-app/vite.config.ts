/// <reference types="vitest" />

import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import nitro from '@analogjs/vite-plugin-nitro';
import { tsrxAngular } from '@analogjs/tsrx-angular';
import { defineConfig } from 'vite';

// Demo app for TSRX components (`.tsrx`) in Analog. TSRX compiles through NGP,
// which also type-checks it; `ANALOG_FAST_COMPILE=true` uses the fast compile
// path instead.
const fastCompile = process.env['ANALOG_FAST_COMPILE'] === 'true';

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
      tsrxAngular(),
      angular(fastCompile ? { fastCompile: true } : { compilation: 'ngp' }),
      nitro(),
    ],
  };
});
