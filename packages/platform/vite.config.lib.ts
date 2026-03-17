import { resolve, dirname, join, relative } from 'node:path';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  existsSync,
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

      // Copy migrations/migration.json
      const migrationsDir = join(outDir, 'migrations');
      mkdirSync(migrationsDir, { recursive: true });
      copyFileSync(
        join(pkgDir, 'migrations/migration.json'),
        join(migrationsDir, 'migration.json'),
      );
    },
  };
}

export default defineConfig({
  plugins: [oxcDtsPlugin(), copyAssetsPlugin()],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    lib: {
      entry: resolve(pkgDir, 'src/index.ts'),
      formats: ['es'],
    },
    outDir: resolve(pkgDir, '../../node_modules/@analogjs/platform'),
    rolldownOptions: {
      external: [
        /^@angular\//,
        /^@analogjs\//,
        /^@nx\//,
        /^nitro/,
        /^vite/,
        /^vitefu/,
        /^node:/,
        /^marked/,
        /^prismjs/,
        /^shiki/,
        /^tinyglobby/,
        /^front-matter/,
        /^js-yaml/,
        /^esprima/,
        /^buffer/,
        /^base64-js/,
        /^ieee754/,
        'tslib',
        'fs',
        'path',
        'url',
        'module',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: pkgDir,
        entryFileNames: '[name].js',
      },
    },
  },
});
