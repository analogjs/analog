/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { defineConfig } from 'vite';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig(({ command }) => {
  const tsconfig =
    process.env['ANALOG_BUILD_LIB_TSCONFIG'] ??
    (command === 'build'
      ? `${__dirname}/tsconfig.lib.json`
      : `${__dirname}/tsconfig.spec.json`);

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/libs/my-package',
    plugins: [
      angular({ jit: false, tsconfig }),
      viteStaticCopy({
        targets: [{ src: ['*.md', 'package.json'], dest: '.' }],
      }),
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
      browser: {
        enabled: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }],
      },
      watch: false,
      teardownTimeout: 3000,
    },
    define: {
      'import.meta.vitest': command !== 'build',
    },
  };
});
