/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { offsetFromRoot } from '@nx/devkit';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'src',
    plugins: [
      {
        name: 'analogjs-pages-esbuild-routes-plugin',
        enforce: 'pre',
        resolveId(id) {
          if (id === 'analog-pages/**/*') {
            return '\0' + id;
          }

          return;
        },
        load(id) {
          if (id.includes('analog-pages/**/*')) {
            return `export default undefined;`;
          }

          return undefined;
        },
      },
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cache: {
        dir: `${offsetFromRoot('packages/router/src')}/node_modules/.vitest`,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
