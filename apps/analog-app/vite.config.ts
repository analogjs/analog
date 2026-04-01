/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, PluginOption } from 'vite';

// Only run in Netlify CI
let base = process.env['URL'] || 'http://localhost:43000';
if (process.env['NETLIFY'] === 'true') {
  if (process.env['CONTEXT'] === 'deploy-preview') {
    base = `${process.env['DEPLOY_PRIME_URL']}/`;
  }
}

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const fileReplacements =
    mode === 'production'
      ? [
          {
            replace: 'apps/analog-app/src/environments/environment.ts',
            with: 'apps/analog-app/src/environments/environment.prod.ts',
          },
          {
            replace:
              'apps/analog-app/src/app/pages/shipping/shipping-service.ts',
            ssr: 'apps/analog-app/src/app/pages/shipping/shipping-service-server.ts',
          },
        ]
      : [
          {
            replace:
              'apps/analog-app/src/app/pages/shipping/shipping-service.ts',
            ssr: 'apps/analog-app/src/app/pages/shipping/shipping-service-server.ts',
          },
        ];

  return {
    root: __dirname,
    publicDir: 'src/public',
    build: {
      outDir: '../../dist/apps/analog-app/client',
      emptyOutDir: true,
      reportCompressedSize: true,
      target: ['es2020'],
    },
    optimizeDeps: {
      include: ['@angular/forms'],
    },
    plugins: [
      analog({
        apiPrefix: 'api',
        include: ['/libs/my-package/src/**/*.ts'],
        discoverRoutes: true,
        fileReplacements,
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
        },
        liveReload: true,
        experimental: {
          useAngularCompilationAPI: true,
          typedRouter: true,
        },
        nitro: {
          routeRules: {
            '/client': {
              ssr: false,
            },
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
      {
        ...((
          await import('rollup-plugin-visualizer')
        ).visualizer() as PluginOption),
      },
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
