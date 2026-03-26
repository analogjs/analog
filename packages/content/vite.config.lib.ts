import { resolve } from 'node:path';
import { defineConfig } from 'vite';
// Keep the npm-scope import so Nx can enforce project boundaries on this
// build-time dependency; `build-lib.mts` runs Vite from the workspace so the
// package still resolves correctly on Windows.
import angular from '@analogjs/vite-plugin-angular';

const tsconfig =
  process.env['ANALOG_BUILD_LIB_TSCONFIG'] ??
  resolve(import.meta.dirname, 'tsconfig.lib.prod.json');

export default defineConfig({
  plugins: [
    angular({
      tsconfig,
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    lib: {
      entry: {
        'analogjs-content': resolve(import.meta.dirname, 'src/index.ts'),
        'analogjs-content-og': resolve(import.meta.dirname, 'og/src/index.ts'),
        'analogjs-content-prism-highlighter': resolve(
          import.meta.dirname,
          'prism-highlighter/src/index.ts',
        ),
        'analogjs-content-shiki-highlighter': resolve(
          import.meta.dirname,
          'shiki-highlighter/src/index.ts',
        ),
        'analogjs-content-mdc': resolve(
          import.meta.dirname,
          'mdc/src/index.ts',
        ),
        'analogjs-content-md4x': resolve(
          import.meta.dirname,
          'md4x/src/index.ts',
        ),
        'analogjs-content-resources': resolve(
          import.meta.dirname,
          'resources/src/index.ts',
        ),
      },
      formats: ['es'],
    },
    outDir: resolve(import.meta.dirname, 'dist'),
    rolldownOptions: {
      external: [
        /^@angular\/.*/,
        /^@nx\/.*/,
        /^@analogjs\/content/,
        /^prismjs/,
        /^marked/,
        /^satori/,
        /^rxjs/,
        /^md4x/,
        /^vite/,
        'front-matter',
        'sharp',
        'tslib',
      ],
      output: {
        chunkFileNames: 'fesm2022/[name].mjs',
        entryFileNames: 'fesm2022/[name].mjs',
      },
    },
  },
});
