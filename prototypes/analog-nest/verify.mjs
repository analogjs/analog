// Checks a running prototype server (dev or production) end to end.
// Usage: node verify.mjs http://localhost:3000
import { createRequire } from 'node:module';

const base = process.argv[2] ?? 'http://localhost:3000';
const origin = new URL(base).origin;
let failures = 0;

async function check(name, request, expect) {
  const res = await fetch(new URL(request.path, base), {
    method: request.method ?? 'GET',
    headers: { origin, ...request.headers },
    body: request.body,
  });
  const text = await res.text();
  const ok =
    res.status === expect.status && (!expect.body || expect.body.test(text));
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name} [${res.status}]${ok ? '' : ` ${text.slice(0, 200)}`}`,
  );
  return text;
}

const json = (body) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const form = (body) => ({
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body,
});

const html = await check(
  'SSR renders page, load data and server fn result',
  { path: '/' },
  {
    status: 200,
    body: /Hello from a page endpoint[\s\S]*Hello Analog, from NestJS/,
  },
);
const fnId = html.match(/__analog_fn_([a-f0-9]{16})_/)?.[1];
if (!fnId) {
  failures++;
  console.log('FAIL  server fn result missing from TransferState');
}
const fn = `/_analog/fn/${fnId}`;

await check(
  'Nest controller GET',
  { path: '/api/hello/Nest' },
  { status: 200, body: /Hello Nest, from NestJS/ },
);
await check(
  'Nest controller POST',
  { path: '/api/hello', method: 'POST', ...json({ name: 'Post' }) },
  { status: 201, body: /Hello Post/ },
);
await check(
  'Nest controller 404 stays JSON',
  { path: '/api/hello/missing' },
  { status: 404, body: /No such greeting/ },
);
await check(
  'unknown /api route is a Nest 404, not SSR',
  { path: '/api/nope' },
  { status: 404, body: /Cannot GET/ },
);
await check(
  'page endpoint load (calls a Nest controller via fetch)',
  { path: '/api/_analog/pages/index' },
  { status: 200, body: /Hello from a page endpoint.*Hello load, from NestJS/ },
);
await check(
  'page action (urlencoded)',
  {
    path: '/api/_analog/pages/index',
    method: 'POST',
    ...form('email=a%40b.dev'),
  },
  { status: 200, body: /"subscribed":"a@b.dev"/ },
);
await check(
  'page action validation',
  { path: '/api/_analog/pages/index', method: 'POST', ...form('email=nope') },
  { status: 422 },
);
await check(
  'server fn resolves Nest provider',
  { path: fn, method: 'POST', ...json({ name: 'Fn' }) },
  { status: 200, body: /Hello Fn, from NestJS/ },
);
await check(
  'server fn input validation',
  { path: fn, method: 'POST', ...json({ name: 42 }) },
  { status: 400 },
);
await check(
  'server fn rejects cross-origin',
  {
    path: fn,
    method: 'POST',
    ...json({ name: 'x' }),
    headers: { origin: 'http://evil.test', 'content-type': 'application/json' },
  },
  { status: 403 },
);

// The page's own instance id must match the controller's: one Nest app, one DI graph.
const ids = new Set();
for (const path of ['/api/hello/a', '/api/hello/b']) {
  ids.add(JSON.parse(await (await fetch(new URL(path, base))).text()).instance);
}
const pageInstance = html.match(/Nest instance (\w+)/)?.[1];
const shared = ids.size === 1 && ids.has(pageInstance);
if (!shared) failures++;
console.log(
  `${shared ? 'PASS' : 'FAIL'}  SSR, server fns and controllers share one GreetingService (${[...ids, pageInstance].join(', ')})`,
);

// Browser: hydration, client-side server fn call and form action.
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('SKIP  browser checks (playwright not installed)');
}
if (chromium) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.fill('input:not([type=email])', 'Browser');
    await page.waitForFunction(() =>
      document
        .querySelector('#server-fn')
        ?.textContent?.includes('Hello Browser'),
    );
    await page.click('button');
    await page.waitForSelector('#action');
    const ok = errors.length === 0;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  browser: hydration, server fn refetch, form action${ok ? '' : ` ${errors.join('; ')}`}`,
    );
  } catch (e) {
    failures++;
    console.log(`FAIL  browser: ${e.message}`);
  } finally {
    await browser.close();
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
