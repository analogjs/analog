import { resolve, join } from 'node:path';
import { copyFileSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { oxcDtsPlugin } from '../../tools/build/shared-plugins.ts';

const pkgDir = resolve(import.meta.dirname);

function copyAssetsPlugin(): Plugin {
  return {
    name: 'copy-assets',
    async writeBundle(options) {
      const outDir = options.dir!;

      // Copy migrations.json
      copyFileSync(
        join(pkgDir, 'migrations.json'),
        join(outDir, 'migrations.json'),
      );
    },
  };
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
        'src/migrations/update-markdown-version/update-markdown-version':
          resolve(
            pkgDir,
            'src/migrations/update-markdown-version/update-markdown-version.ts',
          ),
        'src/migrations/update-markdown-version/compat': resolve(
          pkgDir,
          'src/migrations/update-markdown-version/compat.ts',
        ),
      },
      formats: ['cjs'],
    },
    outDir: resolve(pkgDir, 'dist'),
    rolldownOptions: {
      external: [/^@nx\//, /^@angular\//, /^node:/],
      output: {
        preserveModules: true,
        preserveModulesRoot: pkgDir,
        entryFileNames: '[name].js',
      },
    },
  },
});
