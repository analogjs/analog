import { resolve } from 'node:path';
import { defineConfig, normalizePath } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  oxcDtsPlugin,
  copyPackageJsonPlugin,
} from '../../tools/build/shared-plugins.ts';

const pkgDir = resolve(import.meta.dirname);

export default defineConfig({
  plugins: [oxcDtsPlugin(pkgDir), copyPackageJsonPlugin(pkgDir)],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
      },
      formats: ['es'],
    },
    outDir: resolve(pkgDir, '../../node_modules/@analogjs/vite-plugin-routes'),
    rolldownOptions: {
      external: [
        /^@analogjs\//,
        /^vite/,
        /^node:/,
        /^tinyglobby/,
        /^front-matter/,
        /^schema-dts/,
        'fs',
        'path',
        'url',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: normalizePath(import.meta.dirname),
        entryFileNames: '[name].js',
      },
    },
  },
});
