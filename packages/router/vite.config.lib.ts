import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      tsconfig: resolve(import.meta.dirname, 'tsconfig.lib.prod.json'),
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
    outDir: resolve(import.meta.dirname, '../../node_modules/@analogjs/router'),
    rolldownOptions: {
      external: [
        /^@angular\/.*/,
        /^@analogjs\/.*/,
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
