/// <reference types="vitest" />
import { defineConfig } from 'vite';

import { tsconfigPathsPlugin } from '@analogjs/vite-plugin-angular';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/vite-plugin-nitro',
  plugins: [
    tsconfigPathsPlugin({
      root: '../../',
    }),
  ],
  test: {
    reporters: ['default'],
    globals: true,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
}));
