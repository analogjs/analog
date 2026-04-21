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
        'analogjs-router': resolve(import.meta.dirname, 'src/index.ts'),
        'analogjs-router-content': resolve(
          import.meta.dirname,
          'content/src/index.ts',
        ),
        'analogjs-router-i18n': resolve(
          import.meta.dirname,
          'i18n/src/index.ts',
        ),
        'analogjs-router-tanstack-query': resolve(
          import.meta.dirname,
          'tanstack-query/src/index.ts',
        ),
        'analogjs-router-tanstack-query-server': resolve(
          import.meta.dirname,
          'tanstack-query/server/src/index.ts',
        ),
        'analogjs-router-server': resolve(
          import.meta.dirname,
          'server/src/index.ts',
        ),
        'analogjs-router-server-actions': resolve(
          import.meta.dirname,
          'server/actions/src/index.ts',
        ),
        'analogjs-router-tokens': resolve(
          import.meta.dirname,
          'tokens/src/index.ts',
        ),
      },
      formats: ['es'],
    },
    outDir: resolve(import.meta.dirname, 'dist'),
    rolldownOptions: {
      external: [
        /^@angular\/.*/,
        /^@analogjs\/.*/,
        /^@tanstack\/.*/,
        /^rxjs/,
        'tslib',
        'h3',
        /^nitro\/.*/,
        'node:stream/consumers',
      ],
      output: {
        chunkFileNames: 'fesm2022/[name].mjs',
        entryFileNames: 'fesm2022/[name].mjs',
      },
    },
  },
});
