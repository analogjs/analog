#!/usr/bin/env node
// Run through: pnpm exec nx run analog-app-e2e:server-functions
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { execa } from 'execa';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// Fixed public IDs for src/app/server-fns/http-contract.server.ts. A changed
// producer must not silently change the test's expectations with it.
const ids = {
  greeting: 'f5b69a72f3cbcb7c',
  echoJson: '6e5d209fdd5f0c47',
  echoContext: '880bb270f3034786',
  redirect: '49883cbeef3a1c2d',
  cookies: '0912824029194ac3',
  createdNull: 'b35203f97fd94ba2',
};
const server = execa(
  process.execPath,
  ['dist/apps/analog-app/analog/server/index.mjs'],
  {
    cwd: workspace,
    env: {
      PORT: '0',
      NITRO_PORT: '0',
      HOST: '127.0.0.1',
      NITRO_HOST: '127.0.0.1',
    },
    reject: false,
    forceKillAfterDelay: 5000,
  },
);
const results = [];

try {
  const origin = await new Promise((resolveOrigin, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Nitro did not announce its listening address')),
      15000,
    );
    let output = '';
    const listen = (chunk) => {
      output += stripVTControlCharacters(chunk.toString());
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolveOrigin(match[0]);
      }
    };
    server.stdout.on('data', listen);
    server.stderr.on('data', listen);
    server.then((result) => {
      clearTimeout(timer);
      reject(new Error(`Nitro exited before readiness: ${result.stderr}`));
    });
  });
  const call = (id, init) =>
    fetch(`${origin}/_analog/fn/${id}`, {
      ...init,
      signal: AbortSignal.timeout(10000),
    });
  const post = (id, value, headers = {}) =>
    call(id, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(value),
    });

  // Readiness comes from the listening socket announcement. No HTML or API
  // request has executed before this first call to a page-unreferenced module.
  const cold = await call(ids.greeting);
  assert.equal(cold.status, 200);
  assert.match(cold.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await cold.json(), { message: 'hello from cold HTTP' });
  results.push('cold GET before any HTML request');

  for (const value of [
    null,
    '',
    'text',
    false,
    true,
    0,
    7,
    ['a', 1],
    { nested: true },
  ]) {
    const response = await post(ids.echoJson, value);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('content-type') ?? '',
      /application\/json/,
    );
    assert.deepEqual(await response.json(), value);
  }
  results.push('nine JSON input/output shapes');

  const contexts = await Promise.all(
    ['first', 'second'].map(async (value) => {
      const response = await post(
        ids.echoContext,
        { value },
        { 'x-request-marker': value },
      );
      assert.equal(response.status, 200);
      return response.json();
    }),
  );
  assert.deepEqual(
    contexts,
    ['first', 'second'].map((value) => ({
      value,
      label: 'configured-server',
      requestMarker: value,
    })),
  );
  results.push('application providers and concurrent request headers');

  assert.equal((await call('missing')).status, 404);
  assert.equal((await call(ids.echoContext)).status, 405);
  assert.equal((await post(ids.echoContext, { value: 7 })).status, 400);
  assert.equal(
    (
      await post(
        ids.echoContext,
        { value: 'blocked' },
        {
          origin: 'https://foreign.example',
          'sec-fetch-site': 'cross-site',
        },
      )
    ).status,
    403,
  );
  assert.equal(
    (await post(ids.echoContext, { value: 'denied' }, { 'x-demo-deny': '1' }))
      .status,
    401,
  );
  const malformed = await call(ids.echoJson, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    message: 'Malformed request body',
  });
  results.push(
    'unknown ID, method, validation, origin, interceptor, and malformed body',
  );

  const redirect = await call(ids.redirect, { redirect: 'manual' });
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get('location'), '/render-policy/enabled');
  const cookies = await call(ids.cookies);
  assert.equal(cookies.status, 204);
  assert.equal(await cookies.text(), '');
  assert.deepEqual(cookies.headers.getSetCookie(), [
    'first=one; Path=/; HttpOnly',
    'second=two; Path=/; HttpOnly',
  ]);
  const created = await call(ids.createdNull);
  assert.equal(created.status, 201);
  assert.equal(await created.json(), null);
  results.push('303 redirect, separate 204 cookies, and JSON null with 201');

  writeFileSync(
    resolve(workspace, 'dist/apps/analog-app/server-function-http-result.json'),
    JSON.stringify({ node: process.version, results }, null, 2) + '\n',
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  server.kill('SIGTERM');
  await server;
}
