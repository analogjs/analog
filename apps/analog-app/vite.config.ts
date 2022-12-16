/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, Plugin, splitVendorChunkPlugin } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    publicDir: 'src/public',
    optimizeDeps: {
      include: ['@angular/common', '@angular/forms'],
    },
    build: {
      target: ['es2020'],
    },
    plugins: [
      analog({
        ssr: true,
        ssrBuildDir: '../../dist/apps/analog-app/ssr',
        entryServer: 'apps/analog-app/src/main.server.ts',
        vite: {
          inlineStylesExtension: 'scss',
          tsconfig:
            mode === 'test'
              ? 'apps/analog-app/tsconfig.spec.json'
              : 'apps/analog-app/tsconfig.app.json',
        },
        nitro: {
          rootDir: 'apps/analog-app/src',
          output: {
            dir: '../../../../dist/apps/analog-app/server',
          },
          publicAssets: [{ dir: `../../../../dist/apps/analog-app/client` }],
          serverAssets: [
            { baseName: 'public', dir: `./dist/apps/analog-app/client` },
          ],
          buildDir: '../../../dist/apps/analog-app/.nitro',
        },
      }),
      visualizer() as Plugin,
      splitVendorChunkPlugin(),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cache: {
        dir: `../../node_modules/.vitest`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
