/// <reference types="vitest" />

import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';
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
      nitro(),
    ],
  };
});
