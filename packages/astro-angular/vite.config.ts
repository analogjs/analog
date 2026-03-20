/// <reference types="vitest" />

import path from 'node:path';
import { globSync } from 'tinyglobby';
import { defineConfig, normalizePath } from 'vite';

// https://vitejs.dev/config/
const entries = Object.fromEntries(
  globSync(
    ['src/*.ts', '!src/**/*.d.ts', '!src/**/*.spec.ts', '!src/test-setup.ts'],
    { cwd: __dirname, onlyFiles: true },
  )
    .sort()
    .map((file) => {
      const normalizedFile = normalizePath(file);
      return [normalizedFile.replace(/\.ts$/, ''), normalizedFile];
    }),
);

export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/astro-angular',
    resolve: {
      mainFields: ['module'],
    },
    build: {
      target: 'esnext',
      outDir: '../../node_modules/@analogjs/astro-angular',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      lib: {
        // Emit each public entrypoint so package.json exports resolve in the
        // published src/ layout on every platform.
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
      passWithNoTests: true,
      globals: true,
      setupFiles: [],
      include: ['**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
