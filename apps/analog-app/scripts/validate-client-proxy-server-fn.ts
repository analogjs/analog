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

// Built platform transform, imported from node_modules by relative path.
import { scrubServerFnModule } from '../../../node_modules/@analogjs/platform/src/lib/server-fn-client-transform.js';

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

const scrubbed = scrubServerFnModule(serverSource, 'products.server.ts');
check('transform produced a client module', scrubbed !== null, {
  proxies: scrubbed?.proxies,
});

const code = scrubbed!.code;

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
    'getProducts proxy: GET /_analog/fn/getProducts',
    products?.__serverFn === true &&
      products.id === 'getProducts' &&
      products.url === '/_analog/fn/getProducts' &&
      products.method === 'GET',
    { id: products?.id, url: products?.url, method: products?.method },
  );

  const product = mod.getProduct;
  check(
    'getProduct proxy: POST /_analog/fn/getProduct (input -> POST)',
    product?.__serverFn === true &&
      product.id === 'getProduct' &&
      product.url === '/_analog/fn/getProduct' &&
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
