/// <reference types="vitest" />

import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const tsconfig =
    process.env['ANALOG_BUILD_LIB_TSCONFIG'] ??
    (command === 'build'
      ? `${__dirname}/tsconfig.lib.json`
      : `${__dirname}/tsconfig.spec.json`);

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/libs/top-bar',
    plugins: [
      angular({ jit: false, tsconfig }),
      nxCopyAssetsPlugin(['*.md', 'package.json']),
    ],
    resolve: {
      mainFields: ['module'],
    },
    build: {
      target: ['esnext'],
      sourcemap: true,
      lib: {
        entry: 'src/index.ts',
        fileName: 'fesm2022/top-bar',
        formats: ['es'],
      },
      rollupOptions: {
        external: [/^@angular\/.*/, 'rxjs', 'rxjs/operators'],
        output: {
          preserveModules: false,
        },
      },
      cssCodeSplit: false,
      cssMinify: true,
      minify: false,
    },
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      cacheDir: '../../node_modules/.vitest',
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
