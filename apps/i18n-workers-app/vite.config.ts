import analog from '@analogjs/platform';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  build: { outDir: '../../dist/apps/i18n-workers-app/client' },
  plugins: [
    analog({
      prerender: {
        routes: Array.from({ length: 12 }, (_, id) => `/prerender/${id}`),
        discover: true,
      },
      nitro: { prerender: { concurrency: 8, failOnError: true } },
      i18n: {
        defaultLocale: 'es',
        locales: ['es', 'en'],
        loader: './src/i18n.ts',
      },
    }),
    viteTsConfigPaths(),
  ],
});
