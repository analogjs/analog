/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { resolve } from 'node:path';
import { defineConfig, PluginOption } from 'vite';

// Only run in Netlify CI
let base = process.env['URL'] || 'http://localhost:43000';
if (process.env['NETLIFY'] === 'true') {
  if (process.env['CONTEXT'] === 'deploy-preview') {
    base = `${process.env['DEPLOY_PRIME_URL']}/`;
  }
}

// https://vitejs.dev/config/
export default defineConfig(async ({ mode, command }) => {
  const useBuiltWorkspaceLibs = command === 'build';
  const fileReplacements =
    mode === 'production'
      ? [
          {
            replace: 'apps/analog-app/src/environments/environment.ts',
            with: 'apps/analog-app/src/environments/environment.prod.ts',
          },
        ]
      : [];

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
        content: {
          highlighter: 'prism',
        },
        include: useBuiltWorkspaceLibs
          ? []
          : ['/libs/my-package/src/**/*.ts', '/libs/top-bar/src/**/*.ts'],
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
        hmr: true,
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
      {
        ...((
          await import('rollup-plugin-visualizer')
        ).visualizer() as PluginOption),
      },
    ],
    resolve: useBuiltWorkspaceLibs
      ? {
          alias: {
            '@analogjs/my-package': resolve(
              __dirname,
              '../../dist/libs/my-package/fesm2022/my-package.js',
            ),
            '@analogjs/top-bar': resolve(
              __dirname,
              '../../dist/libs/top-bar/fesm2022/top-bar.js',
            ),
          },
        }
      : undefined,
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
