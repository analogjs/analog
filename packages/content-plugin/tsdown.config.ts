import { resolve, join } from 'node:path';
import { copyFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

// import.meta.dirname requires Node 20.11+; the workspace baseline is >=22.18.0.
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
  // Outputs into @analogjs/content/plugin (not @analogjs/content-plugin) so
  // the published @analogjs/content package can resolve ng-update migrations
  // via its "migrations": "./plugin/migrations.json" field.
  outDir: resolve(pkgDir, '../content/dist/plugin'),
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

      // Signals CJS format to Node.js (workspace root is "type": "module").
      // Source package.json with full metadata is copied during publish.
      writeFileSync(
        join(outDir, 'package.json'),
        JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
      );
    },
  },
});
