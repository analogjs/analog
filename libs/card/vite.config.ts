/// <reference types="vitest" />

import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    plugins: [angular()],
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cache: {
        dir: `../../node_modules/.vitest`,
      },
      deps: {
        inline: ['@analogjs/vitest-angular', 'zone.js'],
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
    ssr: {
      noExternal: ['@analogjs/vitest-angular', 'zone.js'],
    },
  };
});
