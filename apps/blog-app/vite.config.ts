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
        liveReload: true,
        additionalPagesDirs: ['/libs/shared/feature'],
        additionalContentDirs: ['/libs/shared/feature/src/content'],
        content: {
          highlighter: 'shiki',
          shikiOptions: {
            highlighter: {
              additionalLangs: ['mermaid'],
            },
          },
          images: {
            domains: ['images.unsplash.com'],
            sizes: '(max-width: 768px) 100vw, 768px',
            format: 'webp',
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
              '/about-you',
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
            failOnError: true,
          },
          externals: {
            // `sharp` lists `@img/sharp-wasm32` as an optional dependency.
            // pnpm leaves a dangling symlink for it on non-wasm platforms
            // (the package is never fetched), and nitro's external file
            // trace calls `realpath()` on every traced file — throwing
            // ENOENT on that dangling link. Exclude it from the trace; the
            // wasm32 fallback is never used when a native binary is present.
            traceOptions: {
              ignore: (path: string) => path.includes('@img/sharp-wasm32'),
            },
          },
        },
      }),
      nxViteTsPaths(),
    ],
  };
});
