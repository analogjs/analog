/// <reference types="vitest" />

import analog, { type PrerenderContentFile } from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';

// Only run in Netlify CI
let base = process.env['URL'] || 'http://localhost:3000';
if (process.env['NETLIFY'] === 'true') {
  if (process.env['CONTEXT'] === 'deploy-preview') {
    base = `${process.env['DEPLOY_PRIME_URL']}/`;
  }
}

process.env['VITE_ANALOG_BASE_URL'] = base;

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
        vite: {
          experimental: {
            supportAnalogFormat: true,
          },
        },
        additionalPagesDirs: ['/libs/shared/feature'],
        additionalContentDirs: ['/libs/shared/feature/src/content'],
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
              '/about-me',
              '/about-you',
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
        nitro: {
          prerender: {
            failOnError: true,
          },
        },
      }),
      nxViteTsPaths(),
    ],
  };
});
