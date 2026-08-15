import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import {
  createApiRoutesHandler,
  createPageEndpointsHandler,
  createServerFnsHandler,
} from '@analogjs/router/api';
import apiRoutes from 'analog:api-routes';
import pageEndpoints from 'analog:page-endpoints';
// Registers every discovered *.server.ts server function by id.
import 'analog:server-fns';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';

const browserDistFolder = join(import.meta.dirname, '../browser');
const angularApp = new AngularNodeAppEngine();
const api = createApiRoutesHandler(apiRoutes);
const endpoints = createPageEndpointsHandler(pageEndpoints);
const serverFns = createServerFnsHandler({
  providers: [provideServerRendering(), provideZonelessChangeDetection()],
});

// Browsers enforce strict MIME checking for module scripts, so assets
// must be served with a real content type.
const MIME_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

async function handler(
  req: IncomingMessage,
  res: ServerResponse,
  next?: (err?: unknown) => void,
): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (serverFns.matches(pathname)) {
    await serverFns.handler(req, res);
    return;
  }

  if (endpoints.matches(pathname)) {
    await endpoints.handler(req, res);
    return;
  }

  if (api.matches(pathname)) {
    await api.handler(req, res);
    return;
  }

  const asset = join(browserDistFolder, pathname);

  // Serve built assets directly; anything else is rendered by Angular.
  if (pathname !== '/' && existsSync(asset) && statSync(asset).isFile()) {
    res.writeHead(200, {
      'content-type': MIME_TYPES[extname(asset)] ?? 'application/octet-stream',
    });
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
