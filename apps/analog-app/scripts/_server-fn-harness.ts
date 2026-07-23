/**
 * Shared harness helper: registers the demo server module the way the real
 * server build does — by running the built `injectServerFnIds` transform over
 * `products.server.ts` (stamping each serverFn with its derived id) and
 * importing the result. Raw import is intentionally unsupported now: `serverFn`
 * throws without a build-injected id. Exposes the derived ids so the dispatch
 * harnesses can address the opaque routes.
 */
// The built @analogjs/router main/server entries are partially-compiled Angular.
import '@angular/compiler';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Built transform utilities reached by relative path into node_modules: these
// internals are not public package exports, and the barrel that would export
// them pulls in vite/nitro, which this standalone bun harness cannot load.
/* eslint-disable @nx/enforce-module-boundaries */
import { injectServerFnIds } from '../../../node_modules/@analogjs/vite-plugin-nitro/src/lib/utils/inject-server-fn-ids.js';
import { deriveServerFnId } from '../../../node_modules/@analogjs/vite-plugin-nitro/src/lib/utils/derive-server-fn-id.js';
/* eslint-enable @nx/enforce-module-boundaries */

const here = dirname(fileURLToPath(import.meta.url));
const serverFnsDir = join(here, '../src/app/server-fns');

/** Project-root-relative path used as the stable hash input (both sides). */
export const FILE_ID = 'src/app/server-fns/products.server.ts';

/** Derived, opaque route ids — computed exactly as the build transforms do. */
export const ids = {
  getProducts: deriveServerFnId(FILE_ID, 'getProducts'),
  getProduct: deriveServerFnId(FILE_ID, 'getProduct'),
};

let registration: Promise<void> | null = null;

/** Inject ids into the real module and import it, registering the fns. */
export function registerServerFns(): Promise<void> {
  if (registration) return registration;
  registration = (async () => {
    const src = readFileSync(join(serverFnsDir, 'products.server.ts'), 'utf-8');
    const injected = injectServerFnIds(src, FILE_ID);
    if (!injected)
      throw new Error('injectServerFnIds found no server functions');
    // Written beside its relative deps (./schema, ./catalog.service) so imports resolve.
    const tmp = join(serverFnsDir, '.harness.products.server.generated.ts');
    writeFileSync(tmp, injected.code);
    try {
      await import(pathToFileURL(tmp).href);
    } finally {
      rmSync(tmp, { force: true });
    }
  })();
  return registration;
}
