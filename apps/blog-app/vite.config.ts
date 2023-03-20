/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    publicDir: 'src/assets',
    build: {
      target: ['es2020'],
    },
    plugins: [
      analog({
        ssr: true,
        ssrBuildDir: '../../dist/apps/blog-app/ssr',
        entryServer: 'apps/blog-app/src/main.server.ts',
        static: true,
        prerender: {
          routes: async () => {
            return [
              '/',
              '/blog',
              '/about',
              '/blog/2022-12-27-my-first-post',
              '/blog/2022-12-31-my-second-post',
            ];
          },
        },
        vite: {
          tsconfig: 'apps/blog-app/tsconfig.app.json',
        },
        nitro: {
          rootDir: 'apps/blog-app',
          output: {
            dir: '../../../dist/apps/blog-app/analog',
            publicDir: '../../../dist/apps/blog-app/analog/public',
          },
          publicAssets: [{ dir: `../../../dist/apps/blog-app/client` }],
          serverAssets: [
            { baseName: 'public', dir: `./dist/apps/blog-app/client` },
          ],
          buildDir: '../../dist/apps/blog-app/.nitro',
        },
      }),
    ],
  };
});
