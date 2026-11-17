import path, { resolve } from 'node:path';
import { cpSync, writeFileSync } from 'node:fs';
import { defineConfig, normalizePath, type Plugin } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  oxcDtsPlugin,
  readDistPackageJson,
} from '../../tools/build/shared-plugins.ts';

const pkgDir = import.meta.dirname;
const outDir = resolve(pkgDir, 'dist');

function copyPackageFilesPlugin(): Plugin {
  return {
    name: 'copy-package-files',
    closeBundle() {
      cpSync(resolve(pkgDir, 'README.md'), resolve(outDir, 'README.md'));
      writeFileSync(
        resolve(outDir, 'package.json'),
        readDistPackageJson(pkgDir),
      );
    },
  };
}

export default defineConfig({
  plugins: [oxcDtsPlugin(pkgDir), copyPackageFilesPlugin()],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
    outDir,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        'src/cli': resolve(pkgDir, 'src/cli.ts'),
        'src/types': resolve(pkgDir, 'src/types.ts'),
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
