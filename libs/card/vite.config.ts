/// <reference types="vitest" />

import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { createAngularMemoryPlugin } from './plugins/angular-memory-plugin';

const outputFiles = new Map();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    plugins: [
      createAngularMemoryPlugin({
        virtualProjectRoot: __dirname,
        outputFiles,
      }),
      {
        name: 'debug',
        transform(code, id) {
          // console.log({ id })
        },
      },
    ],
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cacheDir: '../../node_modules/.vitest',
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
