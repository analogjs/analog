import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

import { analogNest } from './src/analog-nest/vite-plugin';

export default defineConfig({
  build: { target: ['es2022'] },
  resolve: { mainFields: ['module'] },
  plugins: [analog({ ssr: true }), angular(), analogNest()],
});
