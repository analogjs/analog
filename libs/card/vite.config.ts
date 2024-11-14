/// <reference types="vitest" />

import { defineConfig } from 'vite';
import { getOutputFiles } from '@analogjs/vitest-angular/utils';

import { createAngularMemoryPlugin } from './plugins/angular-memory-plugin';

const outputFiles = getOutputFiles();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    // root: __dirname,
    plugins: [
      createAngularMemoryPlugin({
        virtualProjectRoot: __dirname,
        outputFiles,
      }),
    ],
  };
});
