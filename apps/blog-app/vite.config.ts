/// <reference types="vitest" />

import analog, { type PrerenderContentFile } from '@analogjs/platform';
import { defineConfig } from 'vite';
import { getWorkspaceDependencyExcludes } from '../../tools/vite/get-workspace-dependency-excludes.js';

// Only run in Netlify CI
let base = process.env['URL'] || 'http://localhost:43010';
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
      // Keep workspace Angular libraries on the source-transform path so Analog
      // can compile external templates/styles instead of Vite prebundling them.
      exclude: getWorkspaceDependencyExcludes(__dirname),
    },
    build: {
      outDir: '../../dist/apps/blog-app/client',
      emptyOutDir: true,
      reportCompressedSize: true,
      target: ['es2020'],
    },
    plugins: [
      analog({
        liveReload: true,
        experimental: {
          useAngularCompilationAPI: true,
          typedRouter: true,
        },
        discoverRoutes: true,
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
              {
                route: '/blog/2022-12-27-my-first-post',
                sitemap: () => {
                  return {
                    lastmod: '2022-12-27',
                  };
                },
              },
              '/blog/my-second-post',
              '/about-me',
              // '/about-you' removed — the source file uses .page.analog
              // which is not matched by route discovery (*.page.ts only),
              // so no route is registered and prerendering fails with NG04002.
              {
                contentDir: '/src/content/archived',
                transform: (file: PrerenderContentFile) => {
                  if (file.attributes?.draft) {
                    return false;
                  }
                  return `/archived/${file.attributes.slug || file.name}`;
                },
                sitemap: (file: PrerenderContentFile) => {
                  console.log(file.name);
                  return {
                    changefreq: 'never',
                  };
                },
                outputSourceFile: (file: PrerenderContentFile) => file.content,
              },
            ];
          },
          sitemap: {
            host: 'https://analog-blog.netlify.app',
          },
        },
        nitro: {
          prerender: {
            autoSubfolderIndex: false,
            failOnError: true,
          },
        },
      }),
    ],
  };
});
