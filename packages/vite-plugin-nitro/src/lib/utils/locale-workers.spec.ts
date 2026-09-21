import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createLocaleServer } from '../runtime/locale-workers.mjs';

const entry = new URL(
  `data:text/javascript,${encodeURIComponent(`
    import { createServer } from 'node:http';
    import { parentPort } from 'node:worker_threads';
    const locale = process.env.ANALOG_I18N_LOCALE;
    if (locale === 'broken') throw new Error('Worker startup failed');
    let active = 0;
    const server = createServer(async (req, res) => {
      if (req.url.endsWith('/stream')) {
        res.write(locale + ':first');
        setTimeout(() => res.end(':last'), 100);
        return;
      }
      const concurrent = ++active;
      let body = '';
      for await (const chunk of req) body += chunk;
      await new Promise(resolve => setTimeout(resolve, 40));
      active--;
      res.writeHead(201, { 'set-cookie': ['first=1', 'second=2'] });
      res.end(JSON.stringify({ locale, concurrent, body, host: req.headers.host }));
    });
    parentPort.on('message', () => server.close(() => parentPort.close()));
    server.listen(0, '127.0.0.1', () => {
      parentPort.postMessage({ type: 'ready', port: server.address().port });
    });
  `)}`,
);

const config = { locales: ['en', 'es'], defaultLocale: 'es' };

async function start() {
  const pool = await createLocaleServer(entry, config);
  pool.server.listen(0, '127.0.0.1');
  await once(pool.server, 'listening');
  const { port } = pool.server.address() as AddressInfo;
  return { ...pool, url: `http://127.0.0.1:${port}` };
}

describe('locale worker HTTP transport', () => {
  it('keeps locale requests isolated and concurrent while preserving HTTP data', async () => {
    const pool = await start();
    try {
      const results = await Promise.all(
        Array.from({ length: 4 }, (_, id) =>
          config.locales.map(async (locale) => {
            const response = await fetch(`${pool.url}/${locale}`, {
              method: 'POST',
              headers: { 'accept-language': locale === 'en' ? 'es' : 'en' },
              body: `${locale}:${id}`,
            });
            expect(response.status).toBe(201);
            expect(response.headers.getSetCookie()).toEqual([
              'first=1',
              'second=2',
            ]);
            const result = await response.json();
            expect(result).toMatchObject({
              locale,
              body: `${locale}:${id}`,
              host: new URL(pool.url).host,
            });
            return result;
          }),
        ).flat(),
      );
      for (const locale of config.locales) {
        expect(
          Math.max(
            ...results
              .filter((r) => r.locale === locale)
              .map((r) => r.concurrent),
          ),
        ).toBeGreaterThan(1);
      }
    } finally {
      await pool.close();
    }
  });

  it('finishes an active response stream before closing workers', async () => {
    const pool = await start();
    try {
      const response = await fetch(`${pool.url}/en/stream`);
      const body = response.body;
      if (!body) throw new Error('Expected a response body');
      const reader = body.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(
        'en:first',
      );
      const closing = pool.close();
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(
        ':last',
      );
      expect((await reader.read()).done).toBe(true);
      await closing;
      expect(pool.server.listening).toBe(false);
    } finally {
      await pool.close();
    }
  });

  it('rejects startup and closes the pool when a locale worker fails', async () => {
    await expect(
      createLocaleServer(entry, {
        locales: ['en', 'broken'],
        defaultLocale: 'en',
      }),
    ).rejects.toThrow('Worker startup failed');
  });
});
