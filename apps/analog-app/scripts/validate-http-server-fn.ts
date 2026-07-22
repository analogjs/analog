/**
 * HTTP round-trip validation for the Server Functions prototype (issue #2422).
 * Stands up a real HTTP server mounting the same `dispatchServerFn` the Nitro
 * route uses, then calls GET + POST over the wire — the transport an
 * `injectServerFn`/`ServerFnClient` call exercises in the app.
 * Run: `bun apps/analog-app/scripts/validate-http-server-fn.ts`
 */
// The built @analogjs/router/server is a partially-compiled Angular library.
// Consuming it outside the app's AOT/Linker build needs the JIT compiler.
import '@angular/compiler';
import 'zone.js/node';
import '@angular/platform-server/init';

import {
  dispatchServerFn,
  createServerFnAppInjector,
} from '@analogjs/router/server';
import { serverFnAppProviders } from '../src/app/server-fns';
import { ids, registerServerFns } from './_server-fn-harness';

await registerServerFns();

// The app injector is built ONCE, exactly as the generated Nitro handler does;
// each request dispatches with only `{ parent, method }`.
// Bootstrapped app injector, exactly as the generated Nitro handler builds it,
// so a `providedIn: 'root'` service (CatalogService) resolves without listing.
const appInjector = await createServerFnAppInjector(serverFnAppProviders);

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/_analog\/fn\/([^/]+)$/);
    if (!match) return new Response('not found', { status: 404 });
    const id = match[1];
    const headers = Object.fromEntries(req.headers.entries());
    const input =
      req.method === 'GET' ? undefined : await req.json().catch(() => ({}));
    const event = { node: { req: { headers }, res: {} } } as any;
    const {
      status,
      body,
      headers: outHeaders,
    } = await dispatchServerFn(id, input, event, {
      parent: appInjector,
      method: req.method,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...(outHeaders ?? {}) },
    });
  },
});

const base = `http://localhost:${server.port}`;
let failures = 0;
function check(name: string, cond: boolean, detail: unknown) {
  if (!cond) failures++;
  console.log(
    `[${cond ? 'PASS' : 'FAIL'}] ${name} -> ${JSON.stringify(detail)}`,
  );
}

// GET over HTTP — the route is the derived opaque id
const getRes = await fetch(`${base}/_analog/fn/${ids.getProducts}`);
const getBody = await getRes.json();
check(
  'HTTP GET /_analog/fn/<getProducts hash> -> 200, 3 products',
  getRes.status === 200 && Array.isArray(getBody) && getBody.length === 3,
  { status: getRes.status, count: getBody?.length },
);

// POST over HTTP
const postRes = await fetch(`${base}/_analog/fn/${ids.getProduct}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'p3' }),
});
const postBody = await postRes.json();
check(
  'HTTP POST /_analog/fn/<getProduct hash> {id:p3} -> Phone Standard',
  postRes.status === 200 && postBody?.name === 'Phone Standard',
  { status: postRes.status, body: postBody },
);

// POST invalid input over HTTP
const badRes = await fetch(`${base}/_analog/fn/${ids.getProduct}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 42 }),
});
check('HTTP POST invalid input -> 400', badRes.status === 400, {
  status: badRes.status,
});

// Guessing the human name must NOT resolve (non-enumerable routes).
const guessRes = await fetch(`${base}/_analog/fn/getProducts`);
check('HTTP GET guessed name "getProducts" -> 404', guessRes.status === 404, {
  status: guessRes.status,
});

// Method enforcement: POSTing a GET-only function is rejected with 405 + Allow.
const wrongMethodRes = await fetch(`${base}/_analog/fn/${ids.getProducts}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
check(
  'HTTP POST to a GET function -> 405 + Allow: GET',
  wrongMethodRes.status === 405 &&
    wrongMethodRes.headers.get('Allow') === 'GET',
  { status: wrongMethodRes.status, allow: wrongMethodRes.headers.get('Allow') },
);

// GETting a POST-only function is likewise rejected.
const getPostFnRes = await fetch(`${base}/_analog/fn/${ids.getProduct}`);
check('HTTP GET to a POST function -> 405', getPostFnRes.status === 405, {
  status: getPostFnRes.status,
});

// Same-origin guard: a cross-origin browser call is rejected out of the box.
const crossOriginRes = await fetch(`${base}/_analog/fn/${ids.getProducts}`, {
  headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
});
check(
  'HTTP cross-origin GET -> 403 (same-origin by default)',
  crossOriginRes.status === 403,
  { status: crossOriginRes.status },
);

// A same-origin browser call (Sec-Fetch-Site: same-origin) is allowed.
const sameOriginRes = await fetch(`${base}/_analog/fn/${ids.getProducts}`, {
  headers: { origin: base, 'sec-fetch-site': 'same-origin' },
});
check(
  'HTTP same-origin GET -> 200 (guard allows own origin)',
  sameOriginRes.status === 200,
  { status: sameOriginRes.status },
);

// Guessing an unknown id cross-origin is rejected as 403 BEFORE 404, so the
// registry is not probeable from another origin.
const crossOriginProbeRes = await fetch(`${base}/_analog/fn/deleteAccount`, {
  headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
});
check(
  'HTTP cross-origin probe of unknown id -> 403 (not 404, no existence leak)',
  crossOriginProbeRes.status === 403,
  { status: crossOriginProbeRes.status },
);

// Interceptor deny over HTTP — and its fail() headers survive.
const denyRes = await fetch(`${base}/_analog/fn/${ids.getProducts}`, {
  headers: { 'x-demo-deny': '1' },
});
check(
  'HTTP GET with deny header -> 401 + X-Analog-Errors header preserved',
  denyRes.status === 401 && denyRes.headers.get('X-Analog-Errors') === 'true',
  {
    status: denyRes.status,
    xAnalogErrors: denyRes.headers.get('X-Analog-Errors'),
  },
);

server.stop();
console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
