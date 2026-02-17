import angular from '@analogjs/vite-plugin-angular';
import type { Plugin, TestProjectInlineConfiguration } from 'vitest/config';

export default {
  extends: true,
  plugins: [
    angular({
      jit: false,
      tsconfig: './tsconfig.spec.json',
    }) as unknown as Plugin,
  ],
  test: {
    name: 'aot',
    setupFiles: ['src/aot/test-setup.ts'],
  },
} satisfies TestProjectInlineConfiguration;
