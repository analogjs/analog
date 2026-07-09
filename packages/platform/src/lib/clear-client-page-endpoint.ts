import { Plugin, normalizePath } from 'vite';

import { scrubServerFnModule } from './server-fn-client-transform.js';

export function clearClientPageEndpointsPlugin(): Plugin {
  return {
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
    transform(code, id, options) {
      // Server code must never reach the client bundle.
      if (options?.ssr || !id.endsWith('.server.ts')) {
        return;
      }

      // A `.server.ts` that defines server functions is rewritten to
      // client-safe proxies (keeping the `{ id, url, method }` refs the browser
      // dispatches through); everything else in it — handlers, server imports —
      // is dropped so it tree-shakes away.
      const scrubbed = scrubServerFnModule(code, id);
      if (scrubbed) {
        return { code: scrubbed.code, map: null };
      }

      // Page load/action endpoints carry no client-consumable exports.
      if (id.includes(normalizePath('src/app/pages'))) {
        return {
          code: 'export default undefined;',
          map: null,
        };
      }

      return;
    },
  };
}
