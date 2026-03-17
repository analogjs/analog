import { resolve, dirname, join, relative } from 'node:path';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkgDir = resolve(import.meta.dirname);

function oxcDtsPlugin(): Plugin {
  return {
    name: 'oxc-dts',
    async writeBundle(options, bundle) {
      const { isolatedDeclarationSync } = await import('oxc-transform');
      const outDir = options.dir!;

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.facadeModuleId) continue;

        const sourceFile = chunk.facadeModuleId;
        if (!sourceFile.endsWith('.ts') || sourceFile.endsWith('.d.ts'))
          continue;

        try {
          const source = readFileSync(sourceFile, 'utf-8');
          const result = isolatedDeclarationSync(sourceFile, source, {
            sourcemap: false,
          });

          if (result.code) {
            const dtsPath = join(outDir, fileName.replace(/\.js$/, '.d.ts'));
            mkdirSync(dirname(dtsPath), { recursive: true });
            writeFileSync(dtsPath, result.code);
          }
        } catch {
          // skip files that fail isolated declaration transform
        }
      }

      // Generate .d.ts for type-only source files that were tree-shaken
      const srcDir = resolve(pkgDir, 'src');
      for (const tsFile of walkTs(srcDir)) {
        const relPath = relative(pkgDir, tsFile);
        const dtsOut = join(outDir, relPath.replace(/\.ts$/, '.d.ts'));

        try {
          readFileSync(dtsOut);
          continue;
        } catch {
          // not yet generated
        }

        try {
          const source = readFileSync(tsFile, 'utf-8');
          const result = isolatedDeclarationSync(tsFile, source, {
            sourcemap: false,
          });

          if (result.code) {
            mkdirSync(dirname(dtsOut), { recursive: true });
            writeFileSync(dtsOut, result.code);
          }
        } catch {
          // skip files that fail
        }
      }
    },
  };
}

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkTs(full);
    } else if (
      full.endsWith('.ts') &&
      !full.endsWith('.spec.ts') &&
      !full.endsWith('.test.ts') &&
      !full.endsWith('.d.ts')
    ) {
      yield full;
    }
  }
}

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

function writePackageJsonPlugin(): Plugin {
  return {
    name: 'write-package-json',
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
  plugins: [oxcDtsPlugin(), copyAssetsPlugin(), writePackageJsonPlugin()],
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
