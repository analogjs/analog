import { getRequestListener, serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAnalogRequestHandler } from '../router-server/request-handler';
import type { AnalogNodeApp } from '../router-server/node-handler';

/**
 * The same app on Hono, a fetch-native host: Analog gets only the web
 * Request, never Node objects.
 */
function createHonoApp(): Hono {
  const handleAnalogRequest = createAnalogRequestHandler();
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  if (!import.meta.env.DEV) {
    const root = relative(
      process.cwd(),
      fileURLToPath(new URL('../client', import.meta.url)),
    );
    // Hono's serveStatic has no `index: false`; only the root directory
    // holds index.html, so `/` is left to SSR.
    const staticFiles = serveStatic({ root });
    app.use('*', (c, next) =>
      c.req.path === '/' ? next() : staticFiles(c, next),
    );
  }

  app.all(
    '*',
    async (c) => (await handleAnalogRequest(c.req.raw)) ?? c.notFound(),
  );
  return app;
}

/** Used by the dev server, which mounts the app instead of listening. */
export async function createApp(): Promise<AnalogNodeApp> {
  const listener = getRequestListener(createHonoApp().fetch);
  return { handle: (req, res) => void listener(req, res) };
}

if (!import.meta.env.DEV) {
  serve({
    fetch: createHonoApp().fetch,
    port: Number(process.env['PORT'] ?? 3000),
  });
}
