import { isMainThread, parentPort } from 'node:worker_threads';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { toNodeListener } from 'h3';
import config from '#analog/i18n-workers';
import { createLocaleServer } from './locale-workers.mjs';

export let localFetch;
export let closePrerenderer;

if (isMainThread) {
  if (
    !import.meta.prerender &&
    (process.env.NITRO_SSL_CERT ||
      process.env.NITRO_SSL_KEY ||
      process.env.NITRO_UNIX_SOCKET)
  ) {
    throw new Error(
      'i18n.workers requires an HTTP TCP listener; terminate TLS at your reverse proxy.',
    );
  }
  const { server, close } = await createLocaleServer(new URL(import.meta.url), {
    ...config,
    baseURL: process.env.NITRO_APP_BASE_URL || config.baseURL,
  });
  if (import.meta.prerender) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    localFetch = (input, init) => {
      if (!input.toString().startsWith('/')) return fetch(input, init);
      const headers = new Headers(init?.headers);
      if (!headers.has('host')) headers.set('host', 'localhost');
      return fetch(origin + input, { ...init, headers, redirect: 'manual' });
    };
    closePrerenderer = close;
  } else {
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => void close());
    server.on('error', (error) => {
      console.error(error);
      process.exitCode = 1;
      void close();
    });
    server.listen(
      Number(process.env.NITRO_PORT || process.env.PORT || 3000),
      process.env.NITRO_HOST || process.env.HOST || '0.0.0.0',
      () => {
        console.log(
          `Listening on http://${server.address().address}:${server.address().port}`,
        );
      },
    );
  }
} else {
  // Initialize before Nitro plugins, endpoints, or the SSR app can evaluate $localize.
  await (
    await import('#analog/ssr')
  ).i18nReady;
  const { useNitroApp } = await import('nitropack/runtime');
  const app = useNitroApp();
  const server = createServer(toNodeListener(app.h3App));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  parentPort.on('message', async (message) => {
    if (message !== 'close') return;
    await new Promise((resolve) => server.close(resolve));
    await app.hooks.callHook('close');
    parentPort.close();
  });
  parentPort.postMessage({ type: 'ready', port: server.address().port });
}
