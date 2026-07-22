/**
 * Client-proxy validation for the Server Functions build transform (issue #2422).
 *
 * Runs the real `products.server.ts` through the built `@analogjs/platform`
 * client scrub transform, then imports the emitted client module — which pulls
 * `createServerFnRef` from the built `@analogjs/router` — and asserts the
 * browser bundle would carry only `{ id, url, method }` proxy refs, no server
 * code. This is the client-side counterpart to the server dispatch harnesses.
 * Run: `bun apps/analog-app/scripts/validate-client-proxy-server-fn.ts`
 */
// The built @analogjs/router main entry is a partially-compiled Angular library.
import '@angular/compiler';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Built platform transform reached by relative path: it is not a public package
// export, so this standalone bun harness imports the built file directly.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { scrubServerFnModule } from '../../../node_modules/@analogjs/platform/src/lib/server-fn-client-transform.js';
import { FILE_ID, ids } from './_server-fn-harness';

const here = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(
  join(here, '../src/app/server-fns/products.server.ts'),
  'utf-8',
);

let failures = 0;
function check(name: string, cond: boolean, detail: unknown) {
  if (!cond) failures++;
  console.log(
    `[${cond ? 'PASS' : 'FAIL'}] ${name} -> ${JSON.stringify(detail)}`,
  );
}

const scrubbed = scrubServerFnModule(serverSource, FILE_ID);
check('transform produced a client module', scrubbed !== null, {
  proxies: scrubbed?.proxies,
});

const code = scrubbed!.code;

// SECURITY INVARIANT: the client proxy derives the exact same opaque id the
// server registration uses (shared deriveServerFnId over the project-relative
// path), and it is a digest, not the author name.
const proxyById = Object.fromEntries(
  scrubbed!.proxies.map((p) => [p.name, p.id]),
);
check(
  'client proxy id === server-derived id, and is opaque',
  proxyById['getProducts'] === ids.getProducts &&
    proxyById['getProduct'] === ids.getProduct &&
    /^[0-9a-f]{16}$/.test(ids.getProducts),
  { proxyById, serverIds: ids },
);

// No server code survives into the client module.
for (const forbidden of [
  '@angular/core',
  '@analogjs/router/tokens',
  '@analogjs/router/server',
  'CatalogService',
  'inject(',
  './schema',
]) {
  check(`scrubbed code drops "${forbidden}"`, !code.includes(forbidden), {
    forbidden,
  });
}

// Import the emitted client module (resolves createServerFnRef from the built
// @analogjs/router) and inspect the proxy refs the browser would dispatch.
const tmp = join(here, '.client-proxy.generated.mjs');
writeFileSync(tmp, code);
try {
  const mod = await import(pathToFileURL(tmp).href);

  const products = mod.getProducts;
  check(
    'getProducts proxy: GET /_analog/fn/<hash>',
    products?.__serverFn === true &&
      products.id === ids.getProducts &&
      products.url === `/_analog/fn/${ids.getProducts}` &&
      products.method === 'GET',
    { id: products?.id, url: products?.url, method: products?.method },
  );

  const product = mod.getProduct;
  check(
    'getProduct proxy: POST /_analog/fn/<hash> (input -> POST)',
    product?.__serverFn === true &&
      product.id === ids.getProduct &&
      product.url === `/_analog/fn/${ids.getProduct}` &&
      product.method === 'POST',
    { id: product?.id, url: product?.url, method: product?.method },
  );

  // The ref is dispatch-only; calling it directly must throw, never run server code.
  let threw = false;
  try {
    products({});
  } catch {
    threw = true;
  }
  check('proxy ref throws if invoked directly', threw, { threw });
} finally {
  rmSync(tmp, { force: true });
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
