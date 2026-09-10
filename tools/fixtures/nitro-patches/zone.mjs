import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { serve, toNodeHandler } from 'srvx/node';

const request = globalThis.fetch;
const server = serve({
  port: 0,
  hostname: '127.0.0.1',
  silent: true,
  fetch(req) {
    if (req.url.endsWith('/sync')) return new Response('sync');
    if (req.url.endsWith('/realm'))
      return runInNewContext('Promise.resolve(response)', {
        response: new Response('realm'),
      });
    return (async () => {
      await import('zone.js/node');
      if (req.url.endsWith('/reject')) throw new Error('expected rejection');
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('ok'));
            controller.close();
          },
        }),
      );
    })();
  },
});
await server.ready();
try {
  for (let i = 0; i < 3; i++) {
    const response = await request(server.url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');
  }
  for (const value of ['sync', 'realm'])
    assert.equal(
      await (await request(new URL(value, server.url))).text(),
      value,
    );
  assert.equal((await request(new URL('reject', server.url))).status, 500);
} finally {
  await server.close();
}

const converted = createServer(
  toNodeHandler(async () => new Response('converted')),
);
converted.listen(0, '127.0.0.1');
await once(converted, 'listening');
try {
  for (let i = 0; i < 3; i++) {
    const response = await request(
      `http://127.0.0.1:${converted.address().port}`,
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'converted');
  }
} finally {
  await new Promise((resolve, reject) =>
    converted.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(
  'srvx: repeated Zone.js, sync, cross-realm, streaming, rejection and converted-handler checks passed',
);
