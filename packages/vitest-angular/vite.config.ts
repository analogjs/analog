/// <reference types="vitest" />

import path from 'node:path';
import { defineConfig, normalizePath } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/vitest-angular',
    build: {
      target: 'esnext',
      outDir: '../../node_modules/@analogjs/vitest-angular',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      lib: {
        entry: {
          'src/index': 'src/index.ts',
          'setup-zone': 'setup-zone.ts',
          'setup-snapshots': 'setup-snapshots.ts',
          'setup-testbed': 'setup-testbed.ts',
        },
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
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
