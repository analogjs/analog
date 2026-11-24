/// <reference types="vitest" />

import { defineConfig } from 'vite';
__TAILWIND_IMPORT__import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
__NITRO_IMPORT__
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    analog(__ANALOG_OPTIONS__),
    angular(),
__NITRO_PLUGIN____TAILWIND_PLUGIN__  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
}));
