import { serverFnFileId } from '../utils/derive-server-fn-id.js';
import { injectServerFnIds } from '../utils/inject-server-fn-ids.js';

/**
 * Nitro-build transform that stamps the derived id into each `serverFn` config
 * in a `*.server.ts`, so a function registers under the same opaque route the
 * client proxy dispatches to. The SSR app build does the same via the platform
 * plugin; this covers the separate Nitro server graph the dispatch handler pulls
 * the modules into.
 */
export function serverFnIdPlugin(projectRoot: string) {
  return {
    name: 'analogjs-server-fn-id',
    transform(code: string, id: string) {
      if (!id.endsWith('.server.ts')) {
        return;
      }
      const injected = injectServerFnIds(code, serverFnFileId(id, projectRoot));
      return injected ? { code: injected.code, map: null } : undefined;
    },
  };
}
