/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/my-package',
  plugins: [
    angular({ jit: false }),
    nxViteTsPaths(),
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
      fileName: `fesm2022/my-package`,
      formats: ['es' as const],
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
    isolate: false,
    /**
     * Make sure that all tests are running in the same worker,
     * so that we can test the reset of the TestBed between tests
     * @see src/lib/my-package/reset-test-bed-between-tests/README.md
     */
    maxWorkers: 1,
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
