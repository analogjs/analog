/// <reference types="vitest" />

import analog from "@analogjs/platform";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, Plugin, splitVendorChunkPlugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    publicDir: 'src/public',
    optimizeDeps: {
      include: ['@angular/common', '@angular/forms', 'isomorphic-fetch'],
    },
    ssr: {
      noExternal: '@analogjs/trpc',
    },
    build: {
      target: ['es2020'],
    },
    plugins: [
      analog({
        ssrBuildDir: '../../dist/apps/trpc-rxjs-app/ssr',
        entryServer: 'apps/trpc-rxjs-app/src/main.server.ts',
        vite: {
          inlineStylesExtension: 'css',
          tsconfig:
            mode === 'test'
              ? 'apps/trpc-rxjs-app/tsconfig.spec.json'
              : 'apps/trpc-rxjs-app/tsconfig.app.json',
        },
        nitro: {
          rootDir: 'apps/trpc-rxjs-app',
          output: {
            dir: '../../../dist/apps/trpc-rxjs-app/analog',
            publicDir: '../../../dist/apps/trpc-rxjs-app/analog/public',
          },
          publicAssets: [{ dir: `../../../dist/apps/trpc-rxjs-app/client` }],
          serverAssets: [
            { baseName: 'public', dir: `./dist/apps/trpc-rxjs-app/client` },
          ],
          buildDir: '../../dist/apps/trpc-rxjs-app/.nitro',
          prerender: {
            routes: ['/'],
          },
        },
      }),
      tsConfigPaths({
        root: '../../',
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
