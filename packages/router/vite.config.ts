/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    cacheDir: `../../node_modules/.vitest`,
    resolve: {
      alias: {
        '@analogjs/router/tokens': resolve(__dirname, 'tokens/src/index.ts'),
      },
    },
    test: {
      reporters: ['default'],
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
