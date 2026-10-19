import path, { resolve, dirname, join } from 'node:path';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  defineConfig,
  normalizePath,
  type Plugin,
  type UserConfigExport,
} from 'vite';
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

const config: UserConfigExport = defineConfig({
  plugins: [oxcDtsPlugin(pkgDir), copyAssetsPlugin()],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    lib: {
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        // Loaded by `ng update` / `nx migrate` from migrations/migration.json.
        'migrations/migrate-to-separated-plugins/migrate-to-separated-plugins':
          resolve(
            pkgDir,
            'migrations/migrate-to-separated-plugins/migrate-to-separated-plugins.ts',
          ),
        'migrations/migrate-setup-testbed-browser-mode/migrate-setup-testbed-browser-mode':
          resolve(
            pkgDir,
            'migrations/migrate-setup-testbed-browser-mode/migrate-setup-testbed-browser-mode.ts',
          ),
        'migrations/migrate-vitest-builder-aliases/migrate-vitest-builder-aliases':
          resolve(
            pkgDir,
            'migrations/migrate-vitest-builder-aliases/migrate-vitest-builder-aliases.ts',
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

export default config;
