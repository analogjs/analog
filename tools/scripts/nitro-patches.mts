import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MiniflareEnvRunner } from 'env-runner/runners/miniflare';
import * as miniflare from 'miniflare';
import { serve } from 'srvx/node';

const zone = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL('../fixtures/nitro-patches/zone.mjs', import.meta.url),
    ),
  ],
  { stdio: 'inherit', timeout: 30000 },
);
assert.equal(
  zone.status,
  0,
  String(zone.error ?? zone.signal ?? 'Zone regression failed'),
);
const runner = new MiniflareEnvRunner({
  name: 'analog-request-regression',
  miniflare,
  data: {
    entry: fileURLToPath(
      new URL('../fixtures/nitro-patches/echo.mjs', import.meta.url),
    ),
  },
});
const url = 'http://localhost/echo';
const init = {
  method: 'POST',
  headers: { cookie: 'session=alice', authorization: 'Bearer sample' },
  body: 'payload',
};
const expected = {
  method: 'POST',
  cookie: 'session=alice',
  authorization: 'Bearer sample',
  body: 'payload',
};
try {
  await runner.waitForReady();
  for (const input of [url, new URL(url), '/echo'])
    assert.deepEqual(await (await runner.fetch(input, init)).json(), expected);
  assert.deepEqual(
    await (await runner.fetch(new Request(url, init))).json(),
    expected,
  );
  assert.deepEqual(
    await (
      await runner.fetch(new Request(url, init), {
        method: undefined,
        headers: undefined,
      })
    ).json(),
    expected,
  );
  assert.deepEqual(
    await (
      await runner.fetch(new Request(url, init), {
        method: 'PUT',
        headers: { cookie: 'override' },
        body: 'replacement',
      })
    ).json(),
    {
      method: 'PUT',
      cookie: 'override',
      authorization: null,
      body: 'replacement',
    },
  );
  assert.equal(
    await (await runner.fetch(new Request(url, { method: 'HEAD' }))).text(),
    '',
  );
  const cookies = await Promise.all(
    ['alice', 'bob'].map(
      async (value) =>
        (
          await (
            await runner.fetch(new Request(url, { headers: { cookie: value } }))
          ).json()
        ).cookie,
    ),
  );
  assert.deepEqual(cookies, ['alice', 'bob']);
  const bridge = serve({
    port: 0,
    hostname: '127.0.0.1',
    silent: true,
    fetch: (request) => runner.fetch(request),
  });
  await bridge.ready();
  try {
    assert.deepEqual(
      await (
        await fetch(bridge.url!, {
          ...init,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('payload'));
              controller.close();
            },
          }),
          duplex: 'half',
        } as RequestInit)
      ).json(),
      expected,
    );
  } finally {
    await bridge.close();
  }
  const aborted = new Request(url, { signal: AbortSignal.abort() });
  await assert.rejects(runner.fetch(aborted), { name: 'AbortError' });
  console.log(
    'env-runner: string/URL/Request, init overrides, HEAD, concurrent cookies, streaming NodeRequest and abort checks passed',
  );
} finally {
  await runner.close();
}
