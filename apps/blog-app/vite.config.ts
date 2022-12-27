/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    publicDir: 'src/assets',
    ssr: {
      noExternal: ['@analogjs/router'],
    },
    build: {
      target: ['es2020'],
    },
    plugins: [
      analog({
        ssr: true,
        ssrBuildDir: '../../dist/apps/blog-app/ssr',
        entryServer: 'apps/blog-app/src/main.server.ts',
        vite: {
          tsconfig: 'apps/blog-app/tsconfig.app.json',
        },
        nitro: {
          rootDir: 'apps/blog-app',
          output: {
            dir: '../../../dist/apps/blog-app/server',
          },
          publicAssets: [{ dir: `../../../dist/apps/blog-app/client` }],
          serverAssets: [
            { baseName: 'public', dir: `./dist/apps/blog-app/client` },
          ],
          buildDir: '../../dist/apps/blog-app/.nitro',
          prerender: {
            routes: ['/', '/me', '/you', '/blog/2022-12-27-my-first-post'],
          },
        },
      }),
    ],
  };
});
