/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, Plugin, splitVendorChunkPlugin } from 'vite';
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
          routes: ['/', '/cart', '/shipping'],
          sitemap: {
            host: base,
          },
        },
        vite: {
          inlineStylesExtension: 'scss',
        },
      }),
      nxViteTsPaths(),
      visualizer() as Plugin,
      splitVendorChunkPlugin(),
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
