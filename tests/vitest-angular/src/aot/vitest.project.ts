import angular from '@analogjs/vite-plugin-angular';
import { basename, dirname } from 'path';
import type { Plugin, TestProjectInlineConfiguration } from 'vitest/config';

const name = basename(dirname(__filename));

export default {
  extends: true,
  plugins: [angular({ jit: false }) as unknown as Plugin],
  test: {
    name,
    include: [`src/${name}/**/*.spec.ts`],
    setupFiles: [`src/${name}/test-setup.ts`],
  },
} satisfies TestProjectInlineConfiguration;
