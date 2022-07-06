import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig({
  root: 'src',
  optimizeDeps: {
    exclude: ['rxjs']
  },
  build: {
    outDir: `dist/my-app`,
    emptyOutDir: true
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [angular()],
});
