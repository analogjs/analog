import { Plugin, normalizePath } from 'vite';
import { injectServerFnIds, serverFnFileId } from '@analogjs/vite-plugin-nitro';

import { scrubServerFnModule } from './server-fn-client-transform.js';

export function clearClientPageEndpointsPlugin(): Plugin {
  let projectRoot = process.cwd();
  let isBuild = true;

  return {
    name: 'analogjs-platform-clear-client-page-endpoint',
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
    configResolved(config) {
      projectRoot = config.root;
      isBuild = config.command === 'build';
    },
    transform(code, id, options) {
      if (!id.endsWith('.server.ts')) {
        return;
      }

      // Server-function ids are derived from the project-root-relative path so
      // the client proxy and the server registration always resolve to the same
      // opaque, collision-free route.
      const fileId = serverFnFileId(id, projectRoot);

      if (options?.ssr) {
        // SSR build keeps the real handlers but stamps the derived id into each
        // serverFn config so it registers under the route the client calls.
        const injected = injectServerFnIds(code, fileId);
        return injected ? { code: injected.code, map: null } : undefined;
      }

      // Client build: a `.server.ts` defining server functions is rewritten to
      // client-safe proxies (the `{ id, url, method }` refs the browser
      // dispatches through); handlers and server imports are dropped so they
      // tree-shake away.
      const scrubbed = scrubServerFnModule(code, fileId);
      if (scrubbed) {
        // An empty mapping, not `null`: a null map lets the original module —
        // handlers and all — survive in `sourcesContent` further down the
        // pipeline, which would ship the server code to the browser after the
        // scrub went to the trouble of removing it.
        return { code: scrubbed.code, map: { mappings: '' } };
      }

      // Page load/action endpoints carry no client-consumable exports. Only the
      // client build empties them; the dev server never pulls them into the
      // browser graph, and emptying them there would break the SSR request.
      if (isBuild && id.includes(normalizePath('src/app/pages'))) {
        return {
          code: 'export default undefined;',
          map: null,
        };
      }

      return;
    },
  };
}
