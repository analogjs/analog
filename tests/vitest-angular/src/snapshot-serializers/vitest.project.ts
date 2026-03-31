import angular from '@analogjs/vite-plugin-angular';
import type { Plugin, TestProjectInlineConfiguration } from 'vitest/config';

import { basename, dirname } from 'path';

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
