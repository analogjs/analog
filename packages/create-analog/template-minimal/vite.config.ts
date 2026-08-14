/// <reference types="vitest" />

import { defineConfig } from 'vite';
__TAILWIND_IMPORT__import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
__TAILWIND_PLUGIN__    analog({
      ssr: false,
      prerender: {
        routes: [],
      },
    }),
    angular(),
    nitro({ static: true }),
  ],
}));
