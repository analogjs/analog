import { resolve, dirname, join } from 'node:path';
import { mkdirSync, copyFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { oxcDtsPlugin } from '../../tools/build/shared-plugins.ts';

const pkgDir = resolve(import.meta.dirname);

function copyAssetsPlugin(): Plugin {
  return {
    name: 'copy-assets',
    async writeBundle(options) {
      const outDir = options.dir!;

      // Copy package.json
      copyFileSync(join(pkgDir, 'package.json'), join(outDir, 'package.json'));

      // Copy migrations/migration.json
      const migrationsDir = join(outDir, 'migrations');
      mkdirSync(migrationsDir, { recursive: true });
      copyFileSync(
        join(pkgDir, 'migrations/migration.json'),
        join(migrationsDir, 'migration.json'),
      );

      // Copy handwritten .d.ts (vite-env.d.ts)
      const viteEnvSrc = join(pkgDir, 'src/vite-env.d.ts');
      const viteEnvDest = join(outDir, 'src/vite-env.d.ts');
      mkdirSync(dirname(viteEnvDest), { recursive: true });
      copyFileSync(viteEnvSrc, viteEnvDest);
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
      entry: {
        'src/index': resolve(pkgDir, 'src/index.ts'),
        'src/client': resolve(pkgDir, 'src/client.ts'),
        'src/server': resolve(pkgDir, 'src/server.ts'),
        'src/utils': resolve(pkgDir, 'src/utils.ts'),
      },
      formats: ['es'],
    },
    outDir: resolve(pkgDir, '../../node_modules/@analogjs/astro-angular'),
    rolldownOptions: {
      external: [
        /^@angular\//,
        /^@analogjs\//,
        /^astro/,
        /^rxjs/,
        /^vite/,
        /^node:/,
        'tslib',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: pkgDir,
        entryFileNames: '[name].js',
      },
    },
  },
});
