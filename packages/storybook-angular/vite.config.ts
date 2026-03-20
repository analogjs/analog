/// <reference types="vitest" />

import path from 'node:path';
import { globSync } from 'tinyglobby';
import { defineConfig, normalizePath } from 'vite';

// https://vitejs.dev/config/
const entries = Object.fromEntries(
  globSync(
    [
      'src/**/*.ts',
      '!src/**/*.d.ts',
      '!src/**/*.spec.ts',
      '!src/test-setup.ts',
    ],
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
    cacheDir: '../../node_modules/.vite/storybook-angular',
    build: {
      target: 'esnext',
      outDir: '../../node_modules/@analogjs/storybook-angular',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      lib: {
        // Emit the builder/testing modules alongside the public entry so the
        // packaged builders.json points at real runtime files.
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
      environment: 'node',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cacheDir: `../../node_modules/.vitest`,
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
