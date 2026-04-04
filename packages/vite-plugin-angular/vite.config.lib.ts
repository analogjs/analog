import path, { resolve, dirname } from 'node:path';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig, normalizePath, type Plugin } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  oxcDtsPlugin,
  readDistPackageJson,
} from '../../tools/build/shared-plugins.ts';

const pkgDir = import.meta.dirname;
const outDir = resolve(pkgDir, 'dist');

function copyAssetsPlugin(assets: { from: string; to: string }[]): Plugin {
  return {
    name: 'copy-assets',
    closeBundle() {
      for (const { from, to } of assets) {
        const src = resolve(pkgDir, from);
        const dest = resolve(outDir, to);
        if (existsSync(src)) {
          mkdirSync(dirname(dest), { recursive: true });
          cpSync(src, dest, { recursive: true });
        }
      }
      // Copy package.json with dist-prefix stripping
      writeFileSync(
        resolve(outDir, 'package.json'),
        readDistPackageJson(pkgDir),
      );
    },
  };
}

export default defineConfig({
  plugins: [
    oxcDtsPlugin(pkgDir),
    copyAssetsPlugin([
      { from: 'README.md', to: 'README.md' },
      { from: 'migrations/migration.json', to: 'migrations/migration.json' },
    ]),
  ],
  resolve: {
    alias: {
      '@analogjs/cross-utils': resolve(pkgDir, '../cross-utils/src/index.ts'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    outDir,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        'migrations/migrate-setup-vitest/migrate-setup-vitest': resolve(
          pkgDir,
          'migrations/migrate-setup-vitest/migrate-setup-vitest.ts',
        ),
      },
      formats: ['es' as const],
    },
    rolldownOptions: {
      external: (id: string) =>
        id !== '@analogjs/cross-utils' &&
        !id.startsWith('.') &&
        !id.startsWith('\0') &&
        !path.isAbsolute(id),
      output: {
        preserveModules: true,
        preserveModulesRoot: normalizePath(import.meta.dirname),
        entryFileNames: '[name].js',
      },
    },
  },
});
