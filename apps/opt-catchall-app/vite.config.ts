/// <reference types="vitest" />

import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';
import { resolve } from 'node:path';
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
      reportCompressedSize: true,
      target: ['es2020'],
    },
    server: {
      fs: {
        // Allow Vite's fs fallback to read pnpm content-hash paths so
        // nitro/vite's env-runner can load its own dev runtime entry.
        allow: [resolve(__dirname, '../..')],
      },
    },
    plugins: [
      analog({
        content: {
          highlighter: 'shiki',
        },
      }),
      angular({
        liveReload: true,
        experimental: {
          useAngularCompilationAPI: true,
        },
      }),
      nitro({}),
    ],
  };
});
