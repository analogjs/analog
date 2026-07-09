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

// Run via: bun --preload ./apps/analog-app/scripts/_vite-glob-stub.ts <file>
// (the preload neutralizes a Vite-only macro in a sibling barrel export).
const { dispatchServerFn } = await import('@analogjs/router/server');
const { serverFnAppProviders } = await import('../src/app/server-fns');

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
    const { status, body } = await dispatchServerFn(
      id,
      input,
      event,
      serverFnAppProviders,
    );
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
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

// GET over HTTP
const getRes = await fetch(`${base}/_analog/fn/getProducts`);
const getBody = await getRes.json();
check(
  'HTTP GET /_analog/fn/getProducts -> 200, 3 products',
  getRes.status === 200 && Array.isArray(getBody) && getBody.length === 3,
  { status: getRes.status, count: getBody?.length },
);

// POST over HTTP
const postRes = await fetch(`${base}/_analog/fn/getProduct`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'p3' }),
});
const postBody = await postRes.json();
check(
  'HTTP POST /_analog/fn/getProduct {id:p3} -> Phone Standard',
  postRes.status === 200 && postBody?.name === 'Phone Standard',
  { status: postRes.status, body: postBody },
);

// POST invalid input over HTTP
const badRes = await fetch(`${base}/_analog/fn/getProduct`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 42 }),
});
check('HTTP POST invalid input -> 400', badRes.status === 400, {
  status: badRes.status,
});

// Interceptor deny over HTTP
const denyRes = await fetch(`${base}/_analog/fn/getProducts`, {
  headers: { 'x-demo-deny': '1' },
});
check('HTTP GET with deny header -> 401', denyRes.status === 401, {
  status: denyRes.status,
});

server.stop();
console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
