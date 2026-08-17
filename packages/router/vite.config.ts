/// <reference types="vitest" />

import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    cacheDir: `../../node_modules/.vitest`,
    resolve: {
      // The analog:* virtual modules only exist under the esbuild
      // plugins; stub them so import analysis of the api entry resolves.
      alias: {
        'analog:route-files': `${__dirname}/ssr/src/analog-modules-stub.ts`,
        'analog:api-routes': `${__dirname}/ssr/src/analog-modules-stub.ts`,
        'analog:page-endpoints': `${__dirname}/ssr/src/analog-modules-stub.ts`,
        'analog:server-fns': `${__dirname}/ssr/src/analog-modules-stub.ts`,
        'analog:server-middleware': `${__dirname}/ssr/src/analog-modules-stub.ts`,
      },
    },
    test: {
      reporters: ['default'],
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
