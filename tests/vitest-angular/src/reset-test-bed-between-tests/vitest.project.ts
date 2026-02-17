import angular from '@analogjs/vite-plugin-angular';
import { basename, dirname } from 'path';
import type { Plugin, TestProjectConfiguration } from 'vitest/config';

const name = basename(dirname(__filename));

export default {
  extends: true,
  plugins: [angular() as unknown as Plugin],
  test: {
    name,
    include: [`src/${name}/**/*.spec.ts`],
    setupFiles: [`src/${name}/test-setup.ts`],
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
