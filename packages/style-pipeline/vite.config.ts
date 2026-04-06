/// <reference types="vitest" />

import path from 'node:path';
import { defineConfig, normalizePath } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    build: {
      target: 'esnext',
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      lib: {
        entry: {
          'src/index': 'src/index.ts',
          'src/style-preprocessor': 'src/style-preprocessor.ts',
        },
        formats: ['es' as const],
      },
      rollupOptions: {
        external: (id: string) =>
          !id.startsWith('.') && !id.startsWith('\0') && !path.isAbsolute(id),
        output: {
          preserveModules: true,
          preserveModulesRoot: normalizePath(__dirname),
          entryFileNames: '[name].js',
        },
      },
    },
    cacheDir: '../../node_modules/.vite/style-pipeline',
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'node',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
