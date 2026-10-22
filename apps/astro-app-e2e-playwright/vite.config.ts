/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [nxReadySignal()],
    root: __dirname,
    cacheDir: '../../node_modules/.vite/astro-app-e2e-playwright',
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'node',
      include: ['**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
