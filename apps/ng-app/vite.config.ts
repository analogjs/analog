/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  root: __dirname,
  publicDir: 'src/assets',
  build: {
    outDir: '../../dist/apps/ng-app/client',
    reportCompressedSize: true,
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    analog({
      ssr: false,
      vite: {
        experimental: {
          supportAnalogFormat: true,
        },
      },
    }),
  ],
  test: {
    coverage: {
      reportsDirectory: '../../coverage/apps/ng-app',
      provider: 'v8',
    },
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
