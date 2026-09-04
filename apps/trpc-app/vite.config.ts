/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, PluginOption } from 'vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: import.meta.dirname,
    publicDir: 'src/public',
    optimizeDeps: {
      include: ['@angular/common', '@angular/forms', 'isomorphic-fetch'],
    },
    ssr: {
      noExternal: ['@analogjs/trpc', '@trpc/server'],
    },
    build: {
      outDir: '../../dist/apps/trpc-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    plugins: [
      analog({
        nitro: {
          routeRules: {
            '/': {
              prerender: false,
            },
          },
        },
      }),
      viteTsConfigPaths(),
      visualizer() as PluginOption,
    ],
    test: {
      reporters: ['default'],
      coverage: {
        reportsDirectory: '../../coverage/apps/trpc-app',
        provider: 'v8',
      },
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
