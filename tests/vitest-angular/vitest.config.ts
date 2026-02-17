import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, Plugin } from 'vitest/config';
import aotProject from './src/aot/vitest.project';
import providersProject from './src/providers/vitest.project';
import resetTestBedBetweenTestsProject from './src/reset-test-bed-between-tests/vitest.project';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/tests/vitest-angular',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])] as Plugin[],
  test: {
    watch: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/tests/vitest-angular',
      provider: 'v8' as const,
    },
    isolate: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    projects: [aotProject, resetTestBedBetweenTestsProject, providersProject],
  },
});
