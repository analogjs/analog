import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig({
  root: 'src',
  publicDir: 'assets',
  build: {
    outDir: `../dist/my-app`,
    emptyOutDir: true,
    target: 'es2020'
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [angular()],
});
