import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

import { analogNodeServer } from './src/platform/node-server-plugin';

// The same app served by src/fetch-server/main.ts (Hono) instead of Nest.
export default defineConfig({
  build: { target: ['es2022'] },
  resolve: { mainFields: ['module'] },
  plugins: [
    analog({ ssr: true }),
    angular(),
    analogNodeServer({
      entry: 'src/fetch-server/main.ts',
      serverDirs: ['src/fetch-server', 'src/router-server'],
    }),
  ],
});
