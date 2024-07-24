/// <reference types="vitest" />

import analog, { type PrerenderContentFile } from '@analogjs/platform';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    root: __dirname,
    publicDir: 'src/assets',
    optimizeDeps: {
      include: ['@angular/common'],
    },
    build: {
      outDir: '../../dist/apps/blog-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    plugins: [
      analog({
        static: true,
        additionalPagesDirs: ['/libs/shared/feature'],
        content: {
          highlighter: 'shiki',
          shikiOptions: {
            highlighter: {
              additionalLangs: ['mermaid'],
            },
          },
        },
        prerender: {
          routes: async () => {
            return [
              '/',
              '/blog',
              '/about',
              '/api/rss.xml',
              '/blog/2022-12-27-my-first-post',
              '/blog/my-second-post',
              {
                contentDir: '/src/content/archived',
                transform: (file: PrerenderContentFile) => {
                  if (file.attributes?.draft) {
                    return false;
                  }
                  return `/archived/${file.attributes.slug || file.name}`;
                },
              },
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
