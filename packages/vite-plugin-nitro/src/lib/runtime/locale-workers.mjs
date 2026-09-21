import { Agent, createServer, request } from 'node:http';
import { Worker } from 'node:worker_threads';

export function selectLocale(
  url,
  acceptLanguage,
  { locales, defaultLocale, baseURL = '/' },
) {
  let path = url.split('?')[0];
  const base = baseURL.replace(/\/$/, '');
  if (base && path.startsWith(base + '/')) path = path.slice(base.length);
  const first = path.split('/').filter(Boolean)[0];
  if (locales.includes(first)) return first;
  // Match the router's URL-first locale detection, including unsupported tags.
  if (first && /^[a-z]{2}(-[a-zA-Z]{2,4})?(-[a-zA-Z]{2}|\d{3})?$/.test(first))
    return defaultLocale;
  const preferred = acceptLanguage
    ?.split(',')
    .map((part) => {
      const [locale, quality] = part.trim().split(';');
      return {
        locale: locale.trim(),
        quality: quality ? parseFloat(quality.replace('q=', '')) : 1,
      };
    })
    .sort((a, b) => b.quality - a.quality)[0]?.locale;
  return locales.includes(preferred) ? preferred : defaultLocale;
}

export async function createLocaleServer(entry, config) {
  const workers = [];
  const ports = new Map();
  const agent = new Agent({ keepAlive: true });
  let closing;
  const server = createServer((req, res) => {
    const locale = selectLocale(
      req.url || '/',
      req.headers['accept-language'],
      config,
    );
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port: ports.get(locale),
        path: req.url,
        method: req.method,
        headers: req.headers,
        agent,
      },
      (response) => {
        res.writeHead(
          response.statusCode,
          response.statusMessage,
          response.rawHeaders,
        );
        response.on('error', (error) => res.destroy(error));
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else {
        res.writeHead(502);
        res.end('Locale worker unavailable');
      }
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  });

  function close() {
    return (closing ??= (async () => {
      const deadline = setTimeout(() => {
        server.closeAllConnections();
        for (const worker of workers) void worker.terminate();
      }, 30_000);
      deadline.unref();
      try {
        await new Promise((resolve) => server.close(resolve));
        agent.destroy();
        await Promise.all(
          workers.map(
            (worker) =>
              new Promise((resolve) => {
                if (worker.threadId === -1) return resolve();
                worker.once('exit', resolve);
                worker.postMessage('close');
              }),
          ),
        );
      } finally {
        clearTimeout(deadline);
      }
    })());
  }

  try {
    await Promise.all(
      config.locales.map(
        (locale) =>
          new Promise((resolve, reject) => {
            const worker = new Worker(entry, {
              env: { ...process.env, ANALOG_I18N_LOCALE: locale },
            });
            workers.push(worker);
            let ready = false;
            const timeout = setTimeout(
              () =>
                reject(
                  new Error(`Locale worker ${locale} timed out during startup`),
                ),
              30_000,
            );
            const fail = (error) => {
              clearTimeout(timeout);
              if (!ready) reject(error);
              else if (!closing) {
                console.error(error);
                process.exitCode = 1;
                void close();
              }
            };
            worker.on('error', fail);
            worker.on('exit', (code) =>
              fail(new Error(`Locale worker ${locale} exited (${code})`)),
            );
            worker.once('message', (message) => {
              clearTimeout(timeout);
              if (message.type !== 'ready' || !Number.isInteger(message.port)) {
                reject(
                  new Error(
                    `Invalid startup response from locale worker ${locale}`,
                  ),
                );
                return;
              }
              ready = true;
              ports.set(locale, message.port);
              resolve();
            });
          }),
      ),
    );
  } catch (error) {
    closing = Promise.resolve();
    agent.destroy();
    await Promise.all(workers.map((worker) => worker.terminate()));
    throw error;
  }
  return { server, close };
}
