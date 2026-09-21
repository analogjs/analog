import analog from '@analogjs/platform';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  build: { outDir: '../../dist/apps/i18n-workers-app/client' },
  plugins: [
    analog({
      prerender: { routes: [] },
      nitro: { preset: 'node-server' },
      i18n: {
        defaultLocale: 'es',
        locales: ['es', 'en'],
        workers: { loader: './src/i18n.ts' },
      },
    }),
    viteTsConfigPaths(),
  ],
});
