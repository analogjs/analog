// Would be exported from @analogjs/router/server.
import {
  createServerFnAppInjector,
  createServerFnEventHandler,
} from '@analogjs/router/server';
import type { ServerContext } from '@analogjs/router/tokens';
import {
  createApp,
  createRouter,
  defineEventHandler,
  type EventHandler,
  getRequestURL,
  toNodeListener,
} from 'h3';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { fileURLToPath } from 'node:url';
import { $fetch } from 'ofetch';
import serveStatic from 'serve-static';
import type { ViteDevServer } from 'vite';

import {
  ANALOG_SERVER_MANIFEST,
  type AnalogServerManifest,
  type PageEndpointModule,
} from './server-manifest';

export type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

/** What a server entry's `createApp()` returns to the dev server. */
export type AnalogNodeApp = {
  handle: NodeHandler;
  close?: () => Promise<void>;
};

const SERVER_FN_PREFIX = '/_analog/fn/';
const VITE_SERVER = Symbol.for('analog.node.vite');

/**
 * Serves an Analog app from any Node server: static client files
 * (production), server functions and page endpoints, then SSR for GET
 * requests outside the API prefix. Anything else goes to `next`.
 */
export function createAnalogHandler(): NodeHandler {
  const manifest = serverManifest();
  const pageEndpointPrefix = `/${manifest.apiPrefix}/_analog/pages/`;
  const staticFiles = import.meta.env.DEV
    ? undefined
    : serveStatic(clientDir(), { index: false });
  const endpoints = toNodeListener(createEndpointsApp(manifest));

  const handleAnalog: NodeHandler = (req, res, next) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (
      path.startsWith(SERVER_FN_PREFIX) ||
      path.startsWith(pageEndpointPrefix)
    ) {
      void endpoints(req, res);
    } else if (
      req.method === 'GET' &&
      !path.startsWith(`/${manifest.apiPrefix}/`)
    ) {
      renderPage(manifest, req, res).catch(next);
    } else {
      next();
    }
  };

  return staticFiles
    ? (req, res, next) =>
        staticFiles(req, res, (error) =>
          error ? next(error) : handleAnalog(req, res, next),
        )
    : handleAnalog;
}

function serverManifest(): AnalogServerManifest {
  if (!ANALOG_SERVER_MANIFEST.render) {
    throw new Error(
      'createAnalogHandler() needs the platform server build, which fills in the server manifest.',
    );
  }
  return ANALOG_SERVER_MANIFEST as AnalogServerManifest;
}

async function renderPage(
  manifest: AnalogServerManifest,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const serverReq = req as ServerContext['req'];
  serverReq.originalUrl ??= req.url ?? '/';
  const url = serverReq.originalUrl;
  const render = await manifest.render();
  const html = await render(url, await indexHtml(url), {
    req: serverReq,
    res,
    fetch: serverFetch(requestOrigin(req)),
  });
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
}

function createEndpointsApp(manifest: AnalogServerManifest) {
  // Server functions register when their module is imported, so dispatch
  // waits for every module along with the app injector.
  const appInjector = Promise.all([
    manifest.config(),
    ...manifest.serverFnModules.map((load) => load()),
  ]).then(([config]) => createServerFnAppInjector(config));

  const router = createRouter();
  router.use(`${SERVER_FN_PREFIX}:id`, createServerFnEventHandler(appInjector));
  for (const [route, importEndpoint] of Object.entries(
    manifest.pageEndpoints,
  )) {
    router.use(route, pageEndpointHandler(importEndpoint));
  }
  return createApp().use(router);
}

function pageEndpointHandler(
  importEndpoint: () => Promise<PageEndpointModule>,
): EventHandler {
  return defineEventHandler(async (event) => {
    const endpoint = await importEndpoint();
    const handler = event.method === 'GET' ? endpoint.load : endpoint.action;
    return (
      (await handler?.({
        params: event.context.params,
        req: event.node.req,
        res: event.node.res,
        fetch: serverFetch(getRequestURL(event).origin),
        event,
      })) ?? {}
    );
  });
}

/**
 * An ofetch instance for same-origin calls, as Nitro provides: page endpoints
 * get it as `fetch`, and the router's SSR interceptor uses its `.raw()` to
 * write responses into TransferState.
 */
function serverFetch(origin: string) {
  return $fetch.create({ baseURL: origin });
}

function requestOrigin(req: IncomingMessage): string {
  const protocol = (req.socket as TLSSocket).encrypted ? 'https' : 'http';
  return `${protocol}://${req.headers.host ?? 'localhost'}`;
}

// Server chunks are emitted flat into the server outDir, next to `client/`.
function clientDir(): string {
  return fileURLToPath(new URL('../client', import.meta.url));
}

let builtIndexHtml: string | undefined;

async function indexHtml(url: string): Promise<string> {
  if (import.meta.env.DEV) {
    const vite = (globalThis as Record<symbol, ViteDevServer>)[VITE_SERVER];
    const source = readFileSync(`${vite.config.root}/index.html`, 'utf-8');
    return vite.transformIndexHtml(url, source);
  }
  builtIndexHtml ??= readFileSync(`${clientDir()}/index.html`, 'utf-8');
  return builtIndexHtml;
}
