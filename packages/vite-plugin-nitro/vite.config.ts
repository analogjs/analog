/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig, normalizePath } from 'vite';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/vite-plugin-nitro',
  build: {
    target: 'esnext',
    outDir: '../../node_modules/@analogjs/vite-plugin-nitro',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      // Use an object entry so the key ('src/index') becomes the chunk [name].
      // This ensures the output path matches package.json exports
      // across all platforms with preserveModules.
      entry: { 'src/index': 'src/index.ts' },
      formats: ['es'],
    },
    rollupOptions: {
      // Externalize bare specifiers (e.g. 'typescript', '@angular/compiler-cli')
      // but keep relative imports and resolved absolute paths as internal modules.
      // Uses path.isAbsolute() instead of startsWith('/') to handle both
      // Unix (/usr/...) and Windows (D:\...) absolute paths.
      external: (id) =>
        !id.startsWith('.') && !id.startsWith('\0') && !path.isAbsolute(id),
      output: {
        preserveModules: true,
        // Normalize to forward slashes so rolldown's Rust path-stripping
        // works on Windows, where __dirname uses backslashes.
        preserveModulesRoot: normalizePath(__dirname),
        entryFileNames: '[name].js',
      },
    },
  },
  test: {
    reporters: ['default'],
    globals: true,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
}));
