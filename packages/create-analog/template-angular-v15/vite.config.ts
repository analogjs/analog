/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  root: 'src',
  publicDir: 'assets',
  build: {
    outDir: `../dist/my-app/client`,
    emptyOutDir: true,
    target: 'es2022',
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [analog()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['test.ts'],
    include: ['**/*.spec.ts'],
    cache: {
      dir: `../node_modules/.vitest`,
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
