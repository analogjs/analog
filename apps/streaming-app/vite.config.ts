/// <reference types="vitest" />

import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    root: __dirname,
    publicDir: 'src/assets',
    optimizeDeps: {
      include: ['@angular/common'],
    },
    build: {
      outDir: '../../dist/apps/streaming-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    plugins: [
      analog({
        experimental: {
          streaming: true,
        },
        // Render at request time (no prerender) so streaming is exercised over HTTP.
        prerender: {
          routes: [],
        },
      }),
      angular(),
      nitro({
        // Render these routes fully before committing response headers.
        routeRules: {
          '/buffered': { streaming: false },
          '/fn-buffered': { streaming: false },
        },
      }),
    ],
  };
});
