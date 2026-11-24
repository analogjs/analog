import { resolve, dirname, join, relative } from 'node:path';
import {
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  oxcDtsPlugin,
  readDistPackageJson,
} from '../../tools/build/shared-plugins.ts';

const pkgDir = resolve(import.meta.dirname);

function copyAssetsPlugin(): Plugin {
  return {
    name: 'copy-assets',
    async writeBundle(options) {
      const outDir = options.dir!;

      // Copy package.json with dist-prefix stripping
      writeFileSync(join(outDir, 'package.json'), readDistPackageJson(pkgDir));

      // Copy non-TS assets from src: JSON schemas, builders.json, handwritten .d.ts
      const srcDir = resolve(pkgDir, 'src');
      for (const file of walkNonTs(srcDir)) {
        const relPath = relative(pkgDir, file);
        const dest = join(outDir, relPath);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(file, dest);
      }

      // Copy preset.js from package root
      copyFileSync(join(pkgDir, 'preset.js'), join(outDir, 'preset.js'));
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

export default defineConfig({
  plugins: [oxcDtsPlugin(pkgDir), copyAssetsPlugin()],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        'src/lib/testing': resolve(pkgDir, 'src/lib/testing.ts'),
        'src/lib/preset': resolve(pkgDir, 'src/lib/preset.ts'),
        'src/lib/build-storybook/build-storybook': resolve(
          pkgDir,
          'src/lib/build-storybook/build-storybook.ts',
        ),
        'src/lib/start-storybook/start-storybook': resolve(
          pkgDir,
          'src/lib/start-storybook/start-storybook.ts',
        ),
      },
      formats: ['es'],
    },
    outDir: resolve(pkgDir, 'dist'),
    rolldownOptions: {
      external: [
        /^@angular\//,
        /^@storybook\//,
        /^@analogjs\//,
        /^storybook\//,
        /^vite/,
        /^node:/,
        'tslib',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: pkgDir,
        entryFileNames: '[name].js',
      },
    },
  },
});
