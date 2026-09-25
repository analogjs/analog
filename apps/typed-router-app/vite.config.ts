import analog from '@analogjs/platform';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    root: import.meta.dirname,
    build: {
      outDir: '../../dist/apps/typed-router-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    plugins: [
      analog({ experimental: { typedRouting: true } }),
      viteTsConfigPaths(),
    ],
  };
});
