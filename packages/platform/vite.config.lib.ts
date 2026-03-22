import path, { resolve, dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  defineConfig,
  normalizePath,
  type Plugin,
  type UserConfigExport,
} from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { oxcDtsPlugin } from '../../tools/build/shared-plugins.ts';

const pkgDir = resolve(import.meta.dirname);

function copyAssetsPlugin(): Plugin {
  return {
    name: 'copy-assets',
    async writeBundle(options) {
      const outDir = options.dir!;
      mkdirSync(outDir, { recursive: true });

      // Copy package.json
      writeFileSync(
        join(outDir, 'package.json'),
        readFileSync(join(pkgDir, 'package.json')),
      );

      // Copy migrations/migration.json
      const migrationsDir = join(outDir, 'migrations');
      mkdirSync(migrationsDir, { recursive: true });
      writeFileSync(
        join(migrationsDir, 'migration.json'),
        readFileSync(join(pkgDir, 'migrations/migration.json')),
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
    emptyOutDir: true,
    lib: {
      entry: { 'src/index': resolve(pkgDir, 'src/index.ts') },
      formats: ['es' as const],
    },
    outDir: resolve(pkgDir, '../../node_modules/@analogjs/platform'),
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
