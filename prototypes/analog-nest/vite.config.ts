import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

import { analogNodeServer } from './src/analog-node/vite-plugin';

export default defineConfig({
  build: { target: ['es2022'] },
  resolve: { mainFields: ['module'] },
  plugins: [
    analog({ ssr: true }),
    angular(),
    // `src/analog-node` is listed only because the prototype keeps the
    // generic layer as source; packaged, it would ship as compiled JS.
    analogNodeServer({ serverDirs: ['src/server', 'src/analog-node'] }),
  ],
});
