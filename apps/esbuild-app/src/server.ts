import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';

const browserDistFolder = join(import.meta.dirname, '../browser');
const angularApp = new AngularNodeAppEngine();

async function handler(
  req: IncomingMessage,
  res: ServerResponse,
  next?: (err?: unknown) => void,
): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const asset = join(browserDistFolder, pathname);

  // Serve built assets directly; anything else is rendered by Angular.
  if (pathname !== '/' && existsSync(asset) && statSync(asset).isFile()) {
    res.writeHead(200);
    createReadStream(asset).pipe(res);
    return;
  }

  const response = await angularApp.handle(req);

  if (response) {
    await writeResponseToNodeResponse(response, res);
    return;
  }

  if (next) {
    next();
    return;
  }

  res.writeHead(404).end('Not found');
}

if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 4000);
  createServer((req, res) => handler(req, res)).listen(port, () =>
    console.log(`Listening on http://localhost:${port}`),
  );
}

export const reqHandler = createNodeRequestHandler(handler);
