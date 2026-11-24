import { resolve, dirname } from 'node:path';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
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
        // Guard is defensive; missing assets are caught downstream by
        // verify-package-artifacts.mts during the publish flow.
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

/**
 * Replaces Vite's built-in emptyOutDir with a retry-aware alternative.
 *
 * Vite 8's prepare-out-dir plugin calls rmSync on each directory entry
 * without retries. On overlay filesystems (Dagger, Docker) this fails
 * with ENOTEMPTY when the kernel hasn't finished unlinking inodes.
 * Deleting the entire tree in one rmSync call with maxRetries avoids
 * the race.
 */
function cleanOutDirPlugin(): Plugin {
  return {
    name: 'clean-out-dir',
    buildStart() {
      if (existsSync(outDir)) {
        rmSync(outDir, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    cleanOutDirPlugin(),
    oxcDtsPlugin(pkgDir),
    copyAssetsPlugin([
      { from: 'README.md', to: 'README.md' },
      { from: 'builders.json', to: 'builders.json' },
      {
        from: 'src/lib/builders/build/schema.json',
        to: 'src/lib/builders/build/schema.json',
      },
      {
        from: 'src/lib/builders/test/schema.json',
        to: 'src/lib/builders/test/schema.json',
      },
    ]),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    // Disabled — cleanOutDirPlugin above handles cleanup with retry support.
    emptyOutDir: false,
    outDir,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        'setup-zone': resolve(pkgDir, 'setup-zone.ts'),
        'setup-snapshots': resolve(pkgDir, 'setup-snapshots.ts'),
        'setup-serializers': resolve(pkgDir, 'setup-serializers.ts'),
        'setup-testbed': resolve(pkgDir, 'setup-testbed.ts'),
      },
      formats: ['es'],
    },
    rolldownOptions: {
      external: [
        /^@angular\/.*/,
        /^@angular-devkit\/.*/,
        /^@analogjs\/.*/,
        /^vitest/,
        /^vite/,
        /^node:/,
        'oxc-transform',
        'tinyglobby',
        'zone.js',
        'zone.js/plugins/sync-test',
        'zone.js/plugins/proxy',
        'zone.js/testing',
        'path',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: pkgDir,
        entryFileNames: '[name].js',
      },
    },
  },
});
