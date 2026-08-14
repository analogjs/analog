/// <reference types="vitest" />

import analog, { discoverLibraryRoutes, pageGlobs } from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';
import { resolve } from 'node:path';
import { defineConfig, PluginOption } from 'vite';
import { getWorkspaceDependencyExcludes } from '../../tools/vite/get-workspace-dependency-excludes.js';

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

  const discoveredLibs = discoverLibraryRoutes(resolve(__dirname, '../..'));
  const explicitLibPages = useBuiltWorkspaceLibs
    ? []
    : ['/libs/my-package/src/**/*.ts', '/libs/top-bar/src/**/*.ts'];

  return {
    root: __dirname,
    publicDir: 'src/public',
    build: {
      reportCompressedSize: true,
      target: ['es2020'],
    },
    optimizeDeps: {
      include: ['@angular/forms'],
      // Keep workspace Angular libraries on the source-transform path so Analog
      // can compile external templates/styles instead of Vite prebundling them.
      exclude: getWorkspaceDependencyExcludes(__dirname),
    },
    plugins: [
      analog({
        apiPrefix: 'api',
        content: {
          highlighter: 'prism',
        },
        additionalPagesDirs: discoveredLibs.additionalPagesDirs,
        additionalContentDirs: discoveredLibs.additionalContentDirs,
        additionalAPIDirs: discoveredLibs.additionalAPIDirs,
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
        experimental: {
          typedRouter: true,
        },
      }),
      angular({
        include: [
          ...explicitLibPages,
          ...pageGlobs(discoveredLibs.additionalPagesDirs),
        ],
        additionalContentDirs: discoveredLibs.additionalContentDirs,
        inlineStylesExtension: 'scss',
        fileReplacements,
        fastCompile: true,
      }),
      nitro({
        routeRules: {
          '/client': { ssr: false },
          '/cart/**': { ssr: false },
          '/404.html': { ssr: false },
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
