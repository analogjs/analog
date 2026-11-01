import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import serveStatic from 'serve-static';

import {
  createAnalogHandler,
  type AnalogNodeApp,
} from '../router-server/analog-handler';

/** The same Analog handler on a plain Node server, with no Nest involved. */
export async function createApp(): Promise<AnalogNodeApp> {
  return { handle: createAnalogHandler() };
}

if (!import.meta.env.DEV) {
  const staticFiles = serveStatic(
    fileURLToPath(new URL('../client', import.meta.url)),
    { index: false },
  );
  const handle = createAnalogHandler();
  createServer((req, res) => {
    const notFound = (error?: unknown) => {
      res.statusCode = error ? 500 : 404;
      res.end(error ? 'Internal Server Error' : 'Not Found');
    };
    staticFiles(req, res, (error) =>
      error ? notFound(error) : handle(req, res, notFound),
    );
  }).listen(process.env['PORT'] ?? 3000);
}
