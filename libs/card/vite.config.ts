/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { angularVitest } from '@analogjs/vitest-angular/plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    plugins: [angularVitest()],
  };
});
