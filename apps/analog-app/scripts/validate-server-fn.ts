/**
 * Standalone validation harness for the Server Functions prototype (issue #2422).
 * Exercises the real runtime files (registry, dispatch, interceptors, validation)
 * against the demo `products.server.ts`, proving the server-side design without
 * the app's vite/nitro bootstrap. Run: `bun apps/analog-app/scripts/validate-server-fn.ts`
 */
// The built @analogjs/router/server is a partially-compiled Angular library.
// Consuming it outside the app's AOT/Linker build needs the JIT compiler.
import '@angular/compiler';

import { dispatchServerFn } from '@analogjs/router/server';
import { serverFnAppProviders } from '../src/app/server-fns';

function fakeEvent(headers: Record<string, string> = {}) {
  return { node: { req: { headers }, res: {} } } as any;
}

let failures = 0;
function check(name: string, cond: boolean, detail: unknown) {
  const ok = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`[${ok}] ${name} -> ${JSON.stringify(detail)}`);
}

async function main() {
  // GET (input-less read) — DI (inject) inside handler
  const get = await dispatchServerFn(
    'getProducts',
    undefined,
    fakeEvent({ 'user-agent': 'harness' }),
    serverFnAppProviders,
  );
  check(
    'GET getProducts returns 3 products',
    get.status === 200 &&
      Array.isArray(get.body) &&
      (get.body as any[]).length === 3,
    get,
  );

  // POST (input) — valid, validated + found
  const post = await dispatchServerFn(
    'getProduct',
    { id: 'p2' },
    fakeEvent(),
    serverFnAppProviders,
  );
  check(
    'POST getProduct {id:p2} returns Phone Mini',
    post.status === 200 && (post.body as any)?.name === 'Phone Mini',
    post,
  );

  // POST — invalid input (wrong type) rejected before handler
  const invalid = await dispatchServerFn(
    'getProduct',
    { id: 123 },
    fakeEvent(),
    serverFnAppProviders,
  );
  check(
    'POST getProduct invalid input -> 400',
    invalid.status === 400 && !!(invalid.body as any)?.errors,
    invalid,
  );

  // POST — not found path
  const missing = await dispatchServerFn(
    'getProduct',
    { id: 'nope' },
    fakeEvent(),
    serverFnAppProviders,
  );
  check(
    'POST getProduct unknown id -> notFound',
    missing.status === 200 && (missing.body as any)?.notFound === true,
    missing,
  );

  // Interceptor short-circuit via DI-read header
  const denied = await dispatchServerFn(
    'getProducts',
    undefined,
    fakeEvent({ 'x-demo-deny': '1' }),
    serverFnAppProviders,
  );
  check(
    'interceptor denies -> 401',
    denied.status === 401 && (denied.body as any)?.message?.includes('denied'),
    denied,
  );

  // Unknown function -> 404
  const unknown = await dispatchServerFn(
    'nope',
    undefined,
    fakeEvent(),
    serverFnAppProviders,
  );
  check('unknown fn -> 404', unknown.status === 404, unknown);

  console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
