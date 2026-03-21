import { resolve, dirname, join, relative } from 'node:path';
import {
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { oxcDtsPlugin } from '../../tools/build/shared-plugins.ts';

const pkgDir = resolve(import.meta.dirname);

function copyAssetsPlugin(): Plugin {
  return {
    name: 'copy-assets',
    async writeBundle(options) {
      const outDir = options.dir!;

      // Copy non-TS assets from src (JSON schemas, template files)
      const srcDir = resolve(pkgDir, 'src');
      for (const file of walkNonTs(srcDir)) {
        const relPath = relative(pkgDir, file);
        const dest = join(outDir, relPath);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(file, dest);
      }

      // Copy collection.json
      copyFileSync(
        join(pkgDir, 'collection.json'),
        join(outDir, 'collection.json'),
      );
    },
  };
}

function* walkNonTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkNonTs(full);
    } else if (
      !full.endsWith('.ts') ||
      full.endsWith('.d.ts') // include handwritten .d.ts files
    ) {
      yield full;
    }
  }
}

function writeCjsPackageJsonPlugin(): Plugin {
  return {
    name: 'write-cjs-package-json',
    async writeBundle(options) {
      const outDir = options.dir!;
      writeFileSync(
        join(outDir, 'package.json'),
        JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
      );
    },
  };
}

export default defineConfig({
  plugins: [
    oxcDtsPlugin(pkgDir),
    copyAssetsPlugin(),
    writeCjsPackageJsonPlugin(),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    lib: {
      entry: resolve(pkgDir, 'src/index.ts'),
      formats: ['cjs'],
    },
    outDir: resolve(
      pkgDir,
      '../../node_modules/@analogjs/vitest-angular/src/lib/tools',
    ),
    rolldownOptions: {
      external: [
        /^@angular-devkit\//,
        /^@angular\//,
        /^@schematics\//,
        /^@analogjs\//,
        /^node:/,
        'jsonc-parser',
        'semver',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: pkgDir,
        entryFileNames: '[name].js',
      },
    },
  },
});
