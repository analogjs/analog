/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';__TAILWIND_IMPORT__

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    analog({
      ssr: false,
      static: true,
      prerender: {
        routes: [],
      },__ANALOG_SFC_CONFIG__
    }),__TAILWIND_PLUGIN__
  ],
}));
