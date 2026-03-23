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

      // Copy generators.json and executors.json
      copyFileSync(
        join(pkgDir, 'generators.json'),
        join(outDir, 'generators.json'),
      );
      copyFileSync(
        join(pkgDir, 'executors.json'),
        join(outDir, 'executors.json'),
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
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        // Generators
        'src/generators/app/generator': resolve(
          pkgDir,
          'src/generators/app/generator.ts',
        ),
        'src/generators/app/compat': resolve(
          pkgDir,
          'src/generators/app/compat.ts',
        ),
        'src/generators/preset/generator': resolve(
          pkgDir,
          'src/generators/preset/generator.ts',
        ),
        'src/generators/page/generator': resolve(
          pkgDir,
          'src/generators/page/generator.ts',
        ),
        'src/generators/init/generator': resolve(
          pkgDir,
          'src/generators/init/generator.ts',
        ),
        'src/generators/init/compat': resolve(
          pkgDir,
          'src/generators/init/compat.ts',
        ),
        'src/generators/setup-vitest/generator': resolve(
          pkgDir,
          'src/generators/setup-vitest/generator.ts',
        ),
        'src/generators/setup-vitest/compat': resolve(
          pkgDir,
          'src/generators/setup-vitest/compat.ts',
        ),
        // Executors
        'src/executors/vite/vite.impl': resolve(
          pkgDir,
          'src/executors/vite/vite.impl.ts',
        ),
        'src/executors/vite/compat': resolve(
          pkgDir,
          'src/executors/vite/compat.ts',
        ),
        'src/executors/vite-dev-server/vite-dev-server.impl': resolve(
          pkgDir,
          'src/executors/vite-dev-server/vite-dev-server.impl.ts',
        ),
        'src/executors/vite-dev-server/compat': resolve(
          pkgDir,
          'src/executors/vite-dev-server/compat.ts',
        ),
        'src/executors/vitest/vitest.impl': resolve(
          pkgDir,
          'src/executors/vitest/vitest.impl.ts',
        ),
        'src/executors/vitest/compat': resolve(
          pkgDir,
          'src/executors/vitest/compat.ts',
        ),
      },
      formats: ['cjs'],
    },
    outDir: resolve(
      pkgDir,
      '../../node_modules/@analogjs/platform/src/lib/nx-plugin',
    ),
    rolldownOptions: {
      external: [
        /^@angular-devkit\//,
        /^@angular\//,
        /^@nx\//,
        /^@schematics\//,
        /^@nrwl\//,
        /^nx\//,
        /^node:/,
        'nx',
        'tslib',
        'enquirer',
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
