import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { deriveServerFnId } from '@analogjs/vite-plugin-nitro/server-fn-id';

function assertPageLocale(html, locale, path) {
  assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
  for (const id of ['early', 'late', 'code', 'module']) {
    const text = html.match(
      new RegExp(`<[^>]+id="${id}"[^>]*>(.*?)<\\/`, 's'),
    )?.[1];
    assert.equal(
      text,
      `${locale === 'en' ? 'English' : 'Espanol'} ${id}`,
      `${path}: ${id}`,
    );
  }
}

const prerendered = new Map();
for (const prefix of ['en', 'es', '']) {
  const locale = prefix || 'es';
  const active = [];
  const ids = Array.from({ length: 12 }, (_, id) => String(id));
  if (prefix) ids.push('crawled');
  for (const id of ids) {
    const path = `${prefix ? '/' + prefix : ''}/prerender/${id}`;
    const html = readFileSync(
      resolve(`dist/apps/i18n-workers-app/analog/public${path}/index.html`),
      'utf8',
    );
    assertPageLocale(html, locale, path);
    active.push(Number(html.match(/id="active"[^>]*>(\d+)</)?.[1]));
    prerendered.set(path, html);
  }
  assert(
    Math.max(...active) > 1,
    `${locale}: prerendering must remain concurrent`,
  );
}
console.log(
  `Validated ${prerendered.size} prerendered pages, including crawled links.`,
);
if (process.argv.includes('--prerender-only')) process.exit(0);

const entry = resolve('dist/apps/i18n-workers-app/analog/server/index.mjs');
const child = spawn(process.execPath, [entry], {
  env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (data) => {
  output += data;
});
child.stderr.on('data', (data) => {
  output += data;
});
const deadline = setTimeout(() => child.kill('SIGKILL'), 60_000);
try {
  const port = await new Promise((resolve, reject) => {
    child.once('exit', (code) =>
      reject(new Error(`Server exited (${code}): ${output}`)),
    );
    child.stdout.on('data', () => {
      const match = output.match(/Listening on http:\/\/[^\n]+:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  for (const locale of ['en', 'es']) {
    const path = `/${locale}/prerender/0`;
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), prerendered.get(path));
  }
  async function page(locale, path = `/${locale}`, headers = {}) {
    const requestId = crypto.randomUUID();
    const response = await fetch(base + path, {
      headers: { ...headers, 'x-request-id': requestId },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), requestId);
    assert.equal(response.headers.getSetCookie().length, 2);
    const html = await response.text();
    assertPageLocale(html, locale, path);
    return Number(response.headers.get('x-active-renders'));
  }
  const started = performance.now();
  // Includes the first application boot and first lazy page import per worker.
  for (let batch = 0; batch < 3; batch++) {
    await Promise.all(
      Array.from({ length: 20 }, () => [page('en'), page('es')]).flat(),
    );
  }
  const mixedMs = performance.now() - started;
  for (const locale of ['en', 'es']) {
    const active = await Promise.all(
      Array.from({ length: 20 }, () => page(locale)),
    );
    assert(
      Math.max(...active) > 1,
      'Same-locale rendering must remain concurrent',
    );
  }
  await page('en', '/runtime', { 'accept-language': 'en,es;q=0.5' });
  await page('es', '/runtime', { 'accept-language': 'de,en;q=0.5' });
  await page('es', '/es', { 'accept-language': 'en' });
  await page('es', '/de', { 'accept-language': 'en' });

  const functionId = deriveServerFnId(
    'src/app/functions/locale.server.ts',
    'translatedMessage',
  );
  await Promise.all(
    Array.from({ length: 10 }, () => ['en', 'es'])
      .flat()
      .map(async (locale) => {
        const requestId = crypto.randomUUID();
        const response = await fetch(base + '/_analog/fn/' + functionId, {
          headers: { 'accept-language': locale, 'x-request-id': requestId },
        });
        assert.equal(
          response.status,
          200,
          `${await response.clone().text()}\n${output}`,
        );
        assert.deepEqual(await response.json(), {
          message: `${locale === 'en' ? 'English' : 'Espanol'} code`,
          requestId,
        });
      }),
  );
  await Promise.all([page('en'), page('es')]);

  const echo = await fetch(base + '/api/echo', {
    method: 'POST',
    headers: { 'accept-language': 'en' },
    body: 'request-body',
  });
  assert.equal(echo.status, 201);
  assert.equal(echo.headers.getSetCookie().length, 2);
  assert.deepEqual(await echo.json(), {
    body: 'request-body',
    host: `127.0.0.1:${port}`,
    locale: 'en',
  });

  await Promise.all(
    ['en', 'es'].map(async (locale) => {
      const response = await fetch(base + '/api/stream', {
        headers: { 'accept-language': locale },
      });
      const reader = response.body.getReader();
      const first = await reader.read();
      assert.equal(new TextDecoder().decode(first.value), `${locale}:first\n`);
      const last = await reader.read();
      assert.equal(new TextDecoder().decode(last.value), `${locale}:last\n`);
      assert.equal((await reader.read()).done, true);
    }),
  );
  const abort = new AbortController();
  const stream = await fetch(base + '/api/stream', { signal: abort.signal });
  await stream.body.getReader().read();
  abort.abort();
  await fetch(base + '/en?fail=1').then((response) => response.text());
  await Promise.all([page('en'), page('es')]);
  const diagnostics = await Promise.all(
    ['en', 'es'].map((locale) =>
      fetch(base + '/api/diagnostics', {
        headers: { 'accept-language': locale },
      }).then((response) => response.json()),
    ),
  );
  for (const result of diagnostics) assert.equal(result.registryPresent, false);
  const draining = await fetch(base + '/api/stream');
  const reader = draining.body.getReader();
  await reader.read();
  const shutdown = once(child, 'exit');
  child.kill('SIGTERM');
  assert.equal(
    new TextDecoder().decode((await reader.read()).value),
    'es:last\n',
  );
  assert.equal((await reader.read()).done, true);
  assert.equal((await shutdown)[0], 0);
  console.log(
    JSON.stringify(
      {
        passed: true,
        mixedRequests: 120,
        prerenderedPages: prerendered.size,
        mixedMs: Math.round(mixedMs),
        diagnostics,
      },
      null,
      2,
    ),
  );
} finally {
  let code = child.exitCode,
    signal = child.signalCode;
  if (code === null && signal === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    [code, signal] = await exited;
  }
  clearTimeout(deadline);
  assert.equal(code, 0, `Shutdown failed (${signal}): ${output}`);
}
