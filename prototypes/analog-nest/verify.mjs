// Checks a running prototype server (dev or production) end to end.
// Usage: node verify.mjs http://localhost:3000 [--analog-only]
// --analog-only skips the checks that need Nest (for the node:http host).
import { createRequire } from 'node:module';

const base = process.argv[2] ?? 'http://localhost:3000';
const withNest = !process.argv.includes('--analog-only');
const origin = new URL(base).origin;
let failures = 0;

function report(ok, name, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail}`);
}

async function check(name, request, expect) {
  const res = await fetch(new URL(request.path, base), {
    method: request.method ?? 'GET',
    headers: { origin, ...request.headers },
    body: request.body,
  });
  const text = await res.text();
  const ok =
    res.status === expect.status && (!expect.body || expect.body.test(text));
  report(ok, name, ` [${res.status}]${ok ? '' : ` ${text.slice(0, 200)}`}`);
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
const page = '/api/_analog/pages/index';

// Analog only: these hold on any host.
await check(
  'SSR renders an Analog-only page',
  { path: '/about' },
  {
    status: 200,
    body: /<p id="about">About, from a page endpoint/,
  },
);
await check(
  'page endpoint load (Analog-only page)',
  { path: '/api/_analog/pages/about' },
  {
    status: 200,
    body: /About, from a page endpoint/,
  },
);
await check(
  'page action (urlencoded)',
  { path: page, method: 'POST', ...form('email=a%40b.dev') },
  {
    status: 200,
    body: /"subscribed":"a@b.dev"/,
  },
);
await check(
  'page action validation',
  { path: page, method: 'POST', ...form('email=nope') },
  { status: 422 },
);
await check(
  'unknown server fn id',
  { path: '/_analog/fn/0000000000000000', method: 'POST', ...json({}) },
  {
    status: 404,
    body: /Unknown server function/,
  },
);

if (withNest) {
  const html = await check(
    'SSR renders page, load data and server fn result',
    { path: '/' },
    {
      status: 200,
      body: /Hello from a page endpoint[\s\S]*Hello Analog, from NestJS/,
    },
  );
  const fn = `/_analog/fn/${html.match(/__analog_fn_([a-f0-9]{16})_/)?.[1]}`;

  await check(
    'Nest controller GET',
    { path: '/api/hello/Nest' },
    { status: 200, body: /Hello Nest, from NestJS/ },
  );
  await check(
    'Nest controller POST',
    { path: '/api/hello', method: 'POST', ...json({ name: 'Post' }) },
    {
      status: 201,
      body: /Hello Post/,
    },
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
    { path: page },
    {
      status: 200,
      body: /Hello from a page endpoint.*Hello load, from NestJS/,
    },
  );
  await check(
    'server fn resolves Nest provider',
    { path: fn, method: 'POST', ...json({ name: 'Fn' }) },
    {
      status: 200,
      body: /Hello Fn, from NestJS/,
    },
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
      headers: {
        origin: 'http://evil.test',
        'content-type': 'application/json',
      },
    },
    { status: 403 },
  );

  // The page's instance id must match the controller's: one Nest app, one DI graph.
  const ids = new Set([html.match(/Nest instance (\w+)/)?.[1]]);
  for (const path of ['/api/hello/a', '/api/hello/b']) {
    ids.add((await (await fetch(new URL(path, base))).json()).instance);
  }
  report(
    ids.size === 1,
    'SSR, server fns and controllers share one GreetingService',
    ` (${[...ids].join(', ')})`,
  );
} else {
  await check(
    'unclaimed /api route falls through to the host',
    { path: '/api/nope' },
    { status: 404 },
  );
}

// Browser: hydration, client-side navigation data and (with Nest) the index page.
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('SKIP  browser checks (playwright not installed)');
}
if (chromium) {
  const browser = await chromium.launch();
  const browserPage = await browser.newPage();
  const errors = [];
  browserPage.on('pageerror', (e) => errors.push(e.message));
  browserPage.on(
    'console',
    (m) => m.type() === 'error' && errors.push(m.text()),
  );
  try {
    await browserPage.goto(new URL('/about', base).href, {
      waitUntil: 'networkidle',
    });
    await browserPage.waitForSelector('#about');
    if (withNest) {
      await browserPage.goto(base, { waitUntil: 'networkidle' });
      await browserPage.fill('input:not([type=email])', 'Browser');
      await browserPage.waitForFunction(() =>
        document
          .querySelector('#server-fn')
          ?.textContent?.includes('Hello Browser'),
      );
      await browserPage.click('button');
      await browserPage.waitForSelector('#action');
    }
    report(
      errors.length === 0,
      `browser: hydration${withNest ? ', server fn refetch, form action' : ''}`,
      errors.length ? ` ${errors.join('; ')}` : '',
    );
  } catch (e) {
    report(false, 'browser', ` ${e.message}`);
  } finally {
    await browser.close();
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
