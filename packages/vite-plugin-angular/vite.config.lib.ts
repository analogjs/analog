import path, { resolve, dirname } from 'node:path';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { defineConfig, normalizePath, type Plugin } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { oxcDtsPlugin } from '../../tools/build/shared-plugins.ts';

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
    oxcDtsPlugin(pkgDir),
    copyAssetsPlugin([
      { from: 'README.md', to: 'README.md' },
      { from: 'migrations', to: 'migrations' },
      { from: 'package.json', to: 'package.json' },
    ]),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    outDir,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
      },
      formats: ['es' as const],
    },
    rolldownOptions: {
      external: (id: string) =>
        !id.startsWith('.') && !id.startsWith('\0') && !path.isAbsolute(id),
      output: {
        preserveModules: true,
        preserveModulesRoot: normalizePath(import.meta.dirname),
        entryFileNames: '[name].js',
      },
    },
  },
});
