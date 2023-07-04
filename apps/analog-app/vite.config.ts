/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, Plugin, splitVendorChunkPlugin } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

// Only run in Netlify CI
if (process.env['NETLIFY'] === 'true') {
  let base = process.env['URL'];

  if (process.env['CONTEXT'] === 'deploy-preview') {
    base = `${process.env['DEPLOY_PRIME_URL']}/`;
  }

  // set process.env.VITE_ANALOG_PUBLIC_BASE_URL = base URL
  process.env['VITE_ANALOG_PUBLIC_BASE_URL'] = base;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    publicDir: 'src/public',
    build: {
      target: ['es2020'],
    },
    optimizeDeps: {
      include: ['@angular/forms'],
    },
    plugins: [
      analog({
        apiPrefix: 'api',
        prerender: {
          routes: ['/', '/cart'],
          sitemap: {
            host: process.env['VITE_ANALOG_PUBLIC_BASE_URL'],
          },
        },
        vite: {
          inlineStylesExtension: 'scss',
        },
      }),
      tsConfigPaths({
        root: '../../',
      }),
      visualizer() as Plugin,
      splitVendorChunkPlugin(),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cache: {
        dir: `../../node_modules/.vitest`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
