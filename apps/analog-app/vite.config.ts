import { defineConfig } from 'vite';
import angular from '../../libs/vite-plugin-angular/src';
import { offsetFromRoot } from '@nrwl/devkit';

// https://vitejs.dev/config/
export default defineConfig({
  root: 'src',
  optimizeDeps: {
    exclude: ['rxjs']
  },
  build: {
    outDir: `${offsetFromRoot('apps/analog-app/src')}/dist/apps/analog-app`,
    emptyOutDir: true
  },
  resolve: {
    mainFields: ['module'],
  },

  plugins: [angular()],
});
