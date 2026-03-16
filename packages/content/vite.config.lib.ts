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
        'analogjs-content-resources': resolve(
          import.meta.dirname,
          'resources/src/index.ts',
        ),
      },
      formats: ['es'],
    },
    outDir: resolve(
      import.meta.dirname,
      '../../node_modules/@analogjs/content',
    ),
    rolldownOptions: {
      external: [
        /^@angular\/.*/,
        /^@nx\/.*/,
        /^@analogjs\/content/,
        /^prismjs/,
        /^marked/,
        /^satori/,
        /^rxjs/,
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
