/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import { type VFile } from 'vfile';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  root: __dirname,
  publicDir: 'src/assets',
  build: {
    outDir: '../../dist/apps/ng-app/client',
    reportCompressedSize: true,
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    analog({
      ssr: false,
      static: true,
      vite: {
        experimental: {
          supportAnalogFormat: true,
        },
      },
    }),
  ],
  test: {
    coverage: {
      reportsDirectory: '../../coverage/apps/ng-app',
      provider: 'v8',
    },
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));

const standardTemplateTransform = async (content: string) => {
  return 'this is the transformed content';
};

const vFileTemplateTransform = async (content: string) => {
  return {
    data: { headings: { title: 'hello' } },
    toString() {
      return 'this is the transformed content';
    },
  } as unknown as VFile;
};
