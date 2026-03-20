/// <reference types="vitest" />

import path from 'node:path';
import { globSync } from 'tinyglobby';
import { defineConfig, normalizePath } from 'vite';

// https://vitejs.dev/config/
const entries = Object.fromEntries(
  globSync(['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.spec.ts'], {
    cwd: __dirname,
    onlyFiles: true,
  })
    .sort()
    .map((file) => {
      const normalizedFile = normalizePath(file);
      return [normalizedFile.replace(/\.ts$/, ''), normalizedFile];
    }),
);

export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/nx-plugin',
    build: {
      target: 'esnext',
      outDir: '../../node_modules/@analogjs/platform/src/lib/nx-plugin',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      lib: {
        // Emit generator and executor implementations so the copied Nx manifests
        // resolve to runnable JS files in the packaged output.
        entry: entries,
        formats: ['es' as const],
      },
      rollupOptions: {
        // Externalize bare specifiers (e.g. 'typescript', '@angular/compiler-cli')
        // but keep relative imports and resolved absolute paths as internal modules.
        // Uses path.isAbsolute() instead of startsWith('/') to handle both
        // Unix (/usr/...) and Windows (D:\...) absolute paths.
        external: (id: string) =>
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
      include: ['**/*.spec.ts'],
      exclude: ['**/files/**/*.spec.ts'],
      cacheDir: '../../node_modules/.vitest',
      testTimeout: 10000,
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
