import { Plugin, normalizePath } from 'vite';
import { injectServerFnIds, serverFnFileId } from '@analogjs/vite-plugin-nitro';

import { scrubServerFnModule } from './server-fn-client-transform.js';

export function clearClientPageEndpointsPlugin(): Plugin[] {
  return [
    {
      name: 'analogjs-platform-clear-client-page-endpoint',
      apply: 'build',
      config() {
        return {
          build: {
            rollupOptions: {
              onwarn(warning) {
                if (
                  warning.message.includes('empty chunk') &&
                  warning.message.endsWith('.server')
                ) {
                  return;
                }
              },
            },
          },
        };
      },
      transform(_code, id, options) {
        if (
          !options?.ssr &&
          id.includes(normalizePath('src/app/pages')) &&
          id.endsWith('.server.ts')
        ) {
          return {
            code: 'export default undefined;',
            map: null,
          };
        }

        return;
      },
    },
  ];
}
