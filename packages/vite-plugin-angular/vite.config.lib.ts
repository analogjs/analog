import { resolve, dirname } from 'node:path';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkgDir = import.meta.dirname;
const outDir = resolve(
  pkgDir,
  '../../node_modules/@analogjs/vite-plugin-angular',
);

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
    },
  };
}

export default defineConfig({
  plugins: [
    copyAssetsPlugin([
      { from: 'README.md', to: 'README.md' },
      { from: 'migrations/migration.json', to: 'migrations/migration.json' },
      { from: 'package.json', to: 'package.json' },
    ]),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
    outDir,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        'setup-vitest': resolve(pkgDir, 'setup-vitest.ts'),
      },
      formats: ['es'],
    },
    rolldownOptions: {
      external: [
        /^@angular\/.*/,
        /^@angular-devkit\/.*/,
        'typescript',
        'ts-morph',
        'tinyglobby',
        /^vite/,
        /^esbuild/,
        /^node:/,
        'zone.js',
        'zone.js/plugins/sync-test',
        'zone.js/plugins/proxy',
        'zone.js/testing',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: pkgDir,
        entryFileNames: '[name].js',
      },
    },
  },
});
