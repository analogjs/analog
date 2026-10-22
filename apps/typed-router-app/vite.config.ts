import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import nitro from '@analogjs/vite-plugin-nitro';
import { defineConfig } from 'vite';
import { getWorkspaceDependencyExcludes } from '../../tools/vite/get-workspace-dependency-excludes.js';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

export default defineConfig(() => {
  return {
    root: import.meta.dirname,
    optimizeDeps: {
      exclude: getWorkspaceDependencyExcludes(import.meta.dirname),
    },
    build: {
      outDir: '../../dist/apps/typed-router-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    plugins: [
      analog({ experimental: { typedRouting: true } }),
      angular(),
      nitro(),
      nxReadySignal(),
    ],
  };
});
