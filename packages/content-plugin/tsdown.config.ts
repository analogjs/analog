import { resolve, join } from 'node:path';
import { copyFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

const pkgDir = import.meta.dirname;

export default defineConfig({
  entry: {
    'src/index': resolve(pkgDir, 'src/index.ts'),
    'src/migrations/update-markdown-version/update-markdown-version': resolve(
      pkgDir,
      'src/migrations/update-markdown-version/update-markdown-version.ts',
    ),
    'src/migrations/update-markdown-version/compat': resolve(
      pkgDir,
      'src/migrations/update-markdown-version/compat.ts',
    ),
  },
  format: 'cjs',
  target: 'es2022',
  outDir: resolve(pkgDir, '../../node_modules/@analogjs/content-plugin'),
  sourcemap: true,
  minify: false,
  clean: false,
  dts: { build: true },
  deps: {
    neverBundle: [/^@nx\//, /^@angular\//, /^node:/],
  },
  outputOptions: {
    preserveModules: true,
    preserveModulesRoot: pkgDir,
    entryFileNames: '[name].js',
  },
  hooks: {
    'build:done': async (ctx) => {
      const outDir = ctx.options.outDir!;

      copyFileSync(
        join(pkgDir, 'migrations.json'),
        join(outDir, 'migrations.json'),
      );

      writeFileSync(
        join(outDir, 'package.json'),
        JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
      );
    },
  },
});
