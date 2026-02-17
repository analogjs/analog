import type { TestProjectConfiguration, Plugin } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

export default {
  extends: true,
  plugins: [
    angular({
      tsconfig: './tsconfig.spec.json',
    }) as unknown as Plugin,
  ],
  test: {
    name: 'reset-test-bed-between-tests',
    setupFiles: ['src/reset-test-bed-between-tests/test-setup.ts'],
    /**
     * Make sure that all tests are running in the same worker,
     * so that we can test the reset of the TestBed between tests
     * @see ./README.md
     */
    maxWorkers: 1,
    sequence: {
      /* Diffrent group order than other projects because we have a different maxWorkers. */
      groupOrder: 1,
    },
  },
} satisfies TestProjectConfiguration;
