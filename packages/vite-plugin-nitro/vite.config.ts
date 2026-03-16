/// <reference types="vitest" />
import { defineConfig } from 'vite';

import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/vite-plugin-nitro',
  plugins: [
    viteTsConfigPaths({
      root: '../../',
      projects: [],
    }),
  ],
  test: {
    reporters: ['default'],
    globals: true,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
}));
