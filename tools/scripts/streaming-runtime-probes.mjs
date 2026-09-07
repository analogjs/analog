import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const browserAgent = 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36';
const tail = '<template data-analog-authoritative>';

async function status(origin, id, release = false) {
  const response = await fetch(
    `${origin}/api/probe?id=${encodeURIComponent(id)}&release=${release ? '1' : '0'}`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );
  assert.equal(response.status, 200);
  return response.json();
}

async function waitFor(origin, id, predicate) {
  const deadline = performance.now() + 6000;
  let value;
  do {
    value = await status(origin, id);
    if (predicate(value)) return value;
    await delay(40);
  } while (performance.now() < deadline);
  throw new Error(`Request ${id} did not settle: ${JSON.stringify(value)}`);
}

async function document(origin, id, path = '/', agent = browserAgent) {
  const start = performance.now();
  const response = await fetch(
    `${origin}${path}?id=${encodeURIComponent(id)}`,
    {
      headers: { 'user-agent': agent, 'accept-encoding': 'gzip, br' },
      signal: AbortSignal.timeout(12000),
    },
  );
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const first = decoder.decode((await reader.read()).value, { stream: true });
  const firstByteMs = performance.now() - start;
  if (id.startsWith('gated')) {
    await waitFor(origin, id, (value) => value.pending === 1);
    await status(origin, id, true);
  }
  let html = first;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    html += decoder.decode(next.value, { stream: true });
  }
  html += decoder.decode();
  return {
    first,
    html,
    firstByteMs,
    completeMs: performance.now() - start,
    headers: response.headers,
  };
}

async function disconnectedRequest(origin, id) {
  let request;
  try {
    const first = await new Promise((resolve, reject) => {
      request = get(
        `${origin}/?id=${id}`,
        { headers: { 'user-agent': browserAgent } },
        (response) => {
          response.once('data', (chunk) => {
            response.pause();
            resolve(chunk.toString());
          });
          response.on('error', reject);
        },
      );
      request.on('error', reject);
      request.setTimeout(10000, () =>
        request.destroy(new Error('No stream data')),
      );
    });
    assert.ok(first.length > 0 && !first.includes(tail));
    await waitFor(origin, id, (value) => value.pending === 1);
    // Close the real socket without manually aborting a Worker signal or reader.
    request.destroy();
    const disposed = await waitFor(
      origin,
      id,
      (value) => value.destroyed === 1 && value.pending === 0,
    );
    assert.equal(disposed.aborted, 1);
  } finally {
    request?.destroy();
  }
}

async function browserChecks(origin, label, partial) {
  const browser = await chromium.launch(
    process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : undefined,
  );
  try {
    const page = await browser.newPage({ userAgent: browserAgent });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const id = `browser-${label}`;
    const response = await page.goto(`${origin}/?id=${id}`, {
      waitUntil: 'networkidle',
    });
    assert.equal(response.status(), 200);
    await page
      .locator('[data-slow]')
      .filter({ hasText: `slow-${id}` })
      .waitFor();
    assert.equal(await page.locator('[data-fast]').textContent(), `fast-${id}`);
    assert.equal(
      await page.evaluate(
        (key) => globalThis.__analogStreamProbe?.get(key)?.scheduled ?? 0,
        id,
      ),
      0,
    );
    assert.deepEqual(errors, []);

    await page.goto(`${origin}/?id=failure-browser-${label}`, {
      waitUntil: 'networkidle',
    });
    await page.locator('[data-analog-render-error]').waitFor();
    assert.equal(
      await page.locator('meta[name="robots"]').getAttribute('content'),
      'noindex',
    );
    assert.ok(!(await page.content()).includes('private-stream-fixture-error'));
    assert.deepEqual(errors, []);

    await page.route(`${origin}/incomplete`, (route) =>
      route.fulfill({ contentType: 'text/html', body: partial }),
    );
    await page.goto(`${origin}/incomplete`, { waitUntil: 'networkidle' });
    await page.locator('[data-analog-render-error]').waitFor();
    assert.equal(await page.title(), 'Unable to load this page');
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await browser.close();
  }
}

export async function probeStreamingRuntime({
  origin,
  publicDir,
  entry,
  entryURL,
  label,
  browser = true,
}) {
  const normalId = `gated-${label}`;
  const normal = await document(origin, normalId);
  assert.ok(normal.first.length > 0);
  assert.ok(normal.html.includes('<div data-analog-stream>'));
  assert.ok(!normal.first.includes(tail));
  const blockIndex = normal.html.indexOf('<template data-analog-defer=');
  assert.ok(blockIndex >= 0 && blockIndex < normal.html.indexOf(tail));
  assert.ok(normal.html.includes(`slow-${normalId}`));
  assert.ok(normal.html.endsWith('</body></html>'));
  assert.equal(normal.headers.get('content-encoding'), 'identity');
  assert.equal(normal.headers.get('cache-control'), 'no-store, no-transform');
  assert.equal(
    (await waitFor(origin, normalId, (value) => value.destroyed === 1)).pending,
    0,
  );

  const ids = [`left-${label}`, `right-${label}`];
  const concurrent = await Promise.all(ids.map((id) => document(origin, id)));
  for (const [index, value] of concurrent.entries()) {
    assert.ok(value.html.includes(`fast-${ids[index]}`));
    assert.ok(value.html.includes(`slow-${ids[index]}`));
    assert.ok(!value.html.includes(ids[1 - index]));
    assert.equal((await status(origin, ids[index])).destroyed, 1);
  }

  const buffered = await document(origin, `buffered-${label}`, '/buffered');
  assert.ok(buffered.html.includes(`slow-buffered-${label}`));
  assert.ok(!buffered.html.includes(tail));
  assert.notEqual(
    buffered.headers.get('cache-control'),
    'no-store, no-transform',
  );
  const bot = await document(origin, `bot-${label}`, '/', 'Googlebot');
  assert.ok(bot.html.includes(`slow-bot-${label}`));
  assert.ok(!bot.html.includes(tail));

  const failureId = `failure-${label}`;
  const failure = await document(origin, failureId);
  assert.ok(failure.html.includes('<script data-analog-error>'));
  assert.ok(!failure.html.includes(tail));
  assert.ok(!failure.html.includes('private-stream-fixture-error'));
  await waitFor(origin, failureId, (value) => value.destroyed === 1);
  await disconnectedRequest(origin, `disconnect-${label}`);

  const staticHtml = readFileSync(join(publicDir, 'static/index.html'), 'utf8');
  assert.ok(staticHtml.includes('slow-normal'));
  assert.ok(staticHtml.includes('</html>'));
  assert.ok(!staticHtml.includes(tail));
  assert.ok(
    readFileSync(join(publicDir, 'sitemap.xml'), 'utf8').includes('/static'),
  );
  const sourceResponse = await fetch(
    `${origin}/${entryURL}?id=asset-${label}`,
    {
      headers: { 'user-agent': 'Googlebot' },
      signal: AbortSignal.timeout(10000),
    },
  );
  const publicBytes = Buffer.from(await sourceResponse.arrayBuffer());
  assert.ok(
    !publicBytes.equals(readFileSync(entry)),
    'Static serving must not expose the server entry',
  );
  const shellEnd =
    normal.html.indexOf(
      '</div>',
      normal.html.indexOf('<div data-analog-stream>'),
    ) + '</div>'.length;
  if (browser)
    await browserChecks(origin, label, normal.html.slice(0, shellEnd));
  return {
    label,
    firstByteMs: normal.firstByteMs,
    completeMs: normal.completeMs,
    bytes: Buffer.byteLength(normal.html),
    browser,
    checks: [
      'ordered chunks',
      'concurrent capture',
      'buffered route and crawler',
      'error framing',
      'silent socket disconnect',
      'Angular resource cleanup',
      'prerender HTML and sitemap',
      'server entry excluded from static serving',
    ],
  };
}
