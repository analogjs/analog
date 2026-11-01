import { createServer } from 'node:http';

import {
  createAnalogHandler,
  type AnalogNodeApp,
} from '../router-server/analog-handler';

/** The same Analog handler on a plain Node server, with no Nest involved. */
export async function createApp(): Promise<AnalogNodeApp> {
  return { handle: createAnalogHandler() };
}

if (!import.meta.env.DEV) {
  const handle = createAnalogHandler();
  createServer((req, res) =>
    handle(req, res, (error) => {
      res.statusCode = error ? 500 : 404;
      res.end(error ? 'Internal Server Error' : 'Not Found');
    }),
  ).listen(process.env['PORT'] ?? 3000);
}
