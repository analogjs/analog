/// <reference types="vitest" />

import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import nitro from '@analogjs/vite-plugin-nitro';
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
      // Opt a route out of streaming — it falls back to a buffered render.
      nitro(
        {},
        {
          routeRules: {
            '/buffered': { streaming: false },
            '/fn-buffered': { streaming: false },
          },
        },
      ),
      viteTsConfigPaths(),
    ],
  };
});
