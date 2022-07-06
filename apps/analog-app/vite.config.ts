import { defineConfig } from 'vite';
import angular from '../../dist/libs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig({
  root: 'src',
  build: {
    outDir: '../../dist/analog-app',
    emptyOutDir: true
  },
  resolve: {
    mainFields: ['module'],
  },

  plugins: [angular()],
});
