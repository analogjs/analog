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
        'analogjs-trpc': resolve(import.meta.dirname, 'src/index.ts'),
        'analogjs-trpc-server': resolve(
          import.meta.dirname,
          'server/src/index.ts',
        ),
      },
      formats: ['es'],
    },
    outDir: resolve(import.meta.dirname, '../../node_modules/@analogjs/trpc'),
    rolldownOptions: {
      external: [
        /^@angular\/.*/,
        /^rxjs/,
        /^@trpc\/.*/,
        'tslib',
        'superjson',
        'isomorphic-fetch',
        'h3',
        /^nitro\//,
        'ufo',
      ],
      output: {
        chunkFileNames: 'fesm2022/[name].mjs',
        entryFileNames: 'fesm2022/[name].mjs',
      },
    },
  },
});
