/// <reference types="vitest" />

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from 'vite';
const angularEntry = resolve(
  import.meta.dirname,
  '../../node_modules/@analogjs/vite-plugin-angular/src/index.js',
);

async function loadAngular() {
  const { default: angular } = await import(pathToFileURL(angularEntry).href);

  return angular;
}

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const angular = await loadAngular();

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/content',
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [angular()],
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
