import path, { resolve } from 'node:path';
import { defineConfig, normalizePath } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  oxcDtsPlugin,
  readDistPackageJson,
} from '../../tools/build/shared-plugins.ts';
import { writeFileSync } from 'node:fs';

const pkgDir = resolve(import.meta.dirname);

export default defineConfig({
  plugins: [
    oxcDtsPlugin(pkgDir),
    {
      name: 'copy-package-json',
      writeBundle(options) {
        writeFileSync(
          resolve(options.dir!, 'package.json'),
          readDistPackageJson(pkgDir),
        );
      },
    },
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        'src/style-preprocessor': resolve(pkgDir, 'src/style-preprocessor.ts'),
      },
      formats: ['es' as const],
    },
    outDir: resolve(pkgDir, 'dist'),
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
