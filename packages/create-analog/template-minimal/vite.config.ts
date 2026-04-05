/// <reference types="vitest" />

import { defineConfig } from 'vite';
__TAILWIND_IMPORT__import analog from '@analogjs/platform';

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
      static: true,
      prerender: {
        routes: [],
      },
    }),
  ],
}));
