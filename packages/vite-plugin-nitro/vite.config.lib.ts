import path, { resolve, join } from 'node:path';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig, normalizePath, type Plugin } from 'vite';
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
      mkdirSync(outDir, { recursive: true });

      // Copy package.json with dist-prefix stripping
      writeFileSync(join(outDir, 'package.json'), readDistPackageJson(pkgDir));

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
  plugins: [oxcDtsPlugin(pkgDir), copyAssetsPlugin()],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    lib: {
      // One entry per package.json export subpath. The key becomes the chunk
      // [name], so the emitted path matches the export target on every
      // platform — non-entry modules fall back to preserveModulesRoot, which
      // drops the leading `src/` segment on Windows.
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        'src/lib/utils/debug': resolve(pkgDir, 'src/lib/utils/debug.ts'),
        'src/lib/utils/derive-server-fn-id': resolve(
          pkgDir,
          'src/lib/utils/derive-server-fn-id.ts',
        ),
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
