/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, Plugin } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// Only run in Netlify CI
let base = process.env['URL'] || 'http://localhost:3000';
if (process.env['NETLIFY'] === 'true') {
  if (process.env['CONTEXT'] === 'deploy-preview') {
    base = `${process.env['DEPLOY_PRIME_URL']}/`;
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    publicDir: 'src/public',
    resolve: {
      // Ensure proper module resolution for SSR
      mainFields: ['module', 'jsnext:main', 'jsnext', 'main'],
    },
    build: {
      outDir: '../../dist/apps/analog-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    optimizeDeps: {
      include: ['@angular/forms'],
    },
    plugins: [
      analog({
        apiPrefix: 'api',
        additionalPagesDirs: ['/libs/shared/feature'],
        additionalAPIDirs: ['/libs/shared/feature/src/api'],
        prerender: {
          routes: [
            '/',
            '/cart',
            '/shipping',
            '/client',
            '/404.html',
            {
              route: '/newsletter',
              staticData: true,
            },
          ],
          sitemap: {
            host: base,
          },
        },
        vite: {
          inlineStylesExtension: 'scss',
          experimental: {
            supportAnalogFormat: true,
            // routeTree: {
            //   lazyLoading: true,
            //   angularRoutes: true,
            //   disableLogging: false,
            // },
          },
        },
        liveReload: true,
        nitro: {
          routeRules: {
            '/cart/**': {
              ssr: false,
            },
            '/404.html': {
              ssr: false,
            },
          },
        },
      }),
      nxViteTsPaths(),
      visualizer() as Plugin,
      // !isSsrBuild &&
      //   inspect({
      //     build: true,
      //     outputDir: '../../.vite-inspect/analog-app',
      //   }),
    ],
    test: {
      reporters: ['default'],
      coverage: {
        reportsDirectory: '../../coverage/apps/analog-app',
        provider: 'v8',
      },
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
