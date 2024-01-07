/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    publicDir: 'src/assets',
    optimizeDeps: {
      include: ['@angular/common'],
    },
    build: {
      target: ['es2020'],
    },
    plugins: [
      analog({
        static: true,
        prerender: {
          routes: async () => {
            return [
              '/',
              '/blog',
              '/about',
              '/api/rss.xml',
              '/blog/2022-12-27-my-first-post',
              '/blog/my-second-post',
            ];
          },
          sitemap: {
            host: 'https://analog-blog.netlify.app',
          },
        },
      }),
    ],
  };
});
