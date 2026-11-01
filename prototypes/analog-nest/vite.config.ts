import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

import { analogNodeServer } from './src/platform/node-server-plugin';

export default defineConfig({
  build: { target: ['es2022'] },
  resolve: { mainFields: ['module'] },
  plugins: [
    analog({ ssr: true }),
    angular(),
    // `src/router-server` is listed only because the prototype keeps the
    // router code as source; packaged, it would ship as compiled JS.
    analogNodeServer({ serverDirs: ['src/server', 'src/router-server'] }),
  ],
});
