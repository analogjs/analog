/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [nxReadySignal()],
    root: fileURLToPath(new URL('./tests', import.meta.url)),
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'node',
      include: ['**/*.spec.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      cache: {
        dir: `../../node_modules/.vitest`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
