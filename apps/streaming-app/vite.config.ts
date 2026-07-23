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
        // Opt a route out of streaming — it falls back to a buffered render.
        nitro: {
          routeRules: {
            '/buffered': { streaming: false },
          },
        },
      }),
      nxViteTsPaths(),
    ],
  };
});
