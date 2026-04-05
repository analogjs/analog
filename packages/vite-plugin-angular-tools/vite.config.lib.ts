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

      // Copy non-TS assets from src (JSON schemas)
      const srcDir = resolve(pkgDir, 'src');
      for (const file of walkNonTs(srcDir)) {
        const relPath = relative(pkgDir, file);
        const dest = join(outDir, relPath);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(file, dest);
      }

      // Copy builders.json
      copyFileSync(
        join(pkgDir, 'builders.json'),
        join(outDir, 'builders.json'),
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
    // false: this builds into a subdirectory of vite-plugin-angular's output;
    // emptying would delete sibling files from the parent package build.
    emptyOutDir: false,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        'src/builders/vite/vite-build.impl': resolve(
          pkgDir,
          'src/builders/vite/vite-build.impl.ts',
        ),
        'src/builders/vite-dev-server/dev-server.impl': resolve(
          pkgDir,
          'src/builders/vite-dev-server/dev-server.impl.ts',
        ),
      },
      formats: ['cjs'],
    },
    outDir: resolve(pkgDir, '../vite-plugin-angular/dist/src/lib/tools'),
    rolldownOptions: {
      external: [
        /^@angular-devkit\//,
        /^@angular\//,
        /^@nx\//,
        /^vite/,
        /^node:/,
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: pkgDir,
        entryFileNames: '[name].js',
      },
    },
  },
});
