// Would be exported from @analogjs/router/server.
import {
  createServerFnAppInjector,
  dispatchServerFn,
} from '@analogjs/router/server';
import type { ServerContext } from '@analogjs/router/tokens';
import type { Injector } from '@angular/core';
import { createEvent } from 'h3';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { $fetch } from 'ofetch';
import { createRouter } from 'radix3';
import type { ViteDevServer } from 'vite';

import {
  ANALOG_SERVER_MANIFEST,
  type AnalogServerManifest,
  type PageEndpointModule,
} from './server-manifest';

/**
 * The Node request and response behind a `Request`. Analog's `REQUEST` and
 * `RESPONSE` tokens, page endpoint arguments and server function dispatch are
 * Node-typed, so the first version requires them.
 */
export type AnalogRequestContext = {
  req: IncomingMessage;
  res: ServerResponse;
};

export type AnalogRequestHandler = {
  /** A `Response` for Analog's requests, or `null` for anything else. */
  handle(
    request: Request,
    context: AnalogRequestContext,
  ): Promise<Response | null>;
};

type PageRoute = { importEndpoint: () => Promise<PageEndpointModule> };

const SERVER_FN_PREFIX = '/_analog/fn/';
const VITE_SERVER = Symbol.for('analog.node.vite');

/**
 * Handles Analog's requests: server functions and page endpoints, then SSR for
 * GET requests outside the API prefix. Static client files are the host's job;
 * serve them before calling `handle` (without index fallback), or SSR answers
 * asset URLs.
 */
export function createAnalogRequestHandler(): AnalogRequestHandler {
  const manifest = serverManifest();
  const apiPrefix = `/${manifest.apiPrefix}/`;
  const pageEndpointPrefix = `${apiPrefix}_analog/pages/`;
  const pageRoutes = createRouter<PageRoute>({
    routes: Object.fromEntries(
      Object.entries(manifest.pageEndpoints).map(([route, importEndpoint]) => [
        route,
        { importEndpoint },
      ]),
    ),
  });
  // Server functions register when their module is imported, so dispatch
  // waits for every module along with the app injector.
  const appInjector = Promise.all([
    manifest.config(),
    ...manifest.serverFnModules.map((load) => load()),
  ]).then(([config]) => createServerFnAppInjector(config));

  return {
    async handle(request, context) {
      const url = new URL(request.url);
      if (url.pathname.startsWith(SERVER_FN_PREFIX)) {
        const id = url.pathname.slice(SERVER_FN_PREFIX.length);
        return callServerFn(id, request, context, await appInjector);
      }
      if (url.pathname.startsWith(pageEndpointPrefix)) {
        const route = pageRoutes.lookup(url.pathname);
        return route ? callPageEndpoint(route, request, url, context) : null;
      }
      if (request.method === 'GET' && !url.pathname.startsWith(apiPrefix)) {
        return renderPage(manifest, url, context);
      }
      return null;
    },
  };
}

function serverManifest(): AnalogServerManifest {
  if (!ANALOG_SERVER_MANIFEST.render) {
    throw new Error(
      'createAnalogRequestHandler() needs the platform server build, which fills in the server manifest.',
    );
  }
  return ANALOG_SERVER_MANIFEST as AnalogServerManifest;
}

async function callServerFn(
  id: string,
  request: Request,
  context: AnalogRequestContext,
  parent: Injector,
): Promise<Response> {
  let input: unknown;
  if (request.method !== 'GET') {
    const text = await request.text();
    try {
      input = text ? JSON.parse(text) : undefined;
    } catch {
      return Response.json(
        { message: 'Malformed request body' },
        { status: 400 },
      );
    }
  }
  const { status, body, headers } = await dispatchServerFn(
    id,
    input,
    { node: context },
    { parent, method: request.method },
  );
  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(headers ?? {})) {
    for (const item of [value].flat()) {
      responseHeaders.append(key, item);
    }
  }
  return Response.json(body ?? null, { status, headers: responseHeaders });
}

async function callPageEndpoint(
  route: PageRoute & { params?: Record<string, string> },
  request: Request,
  url: URL,
  context: AnalogRequestContext,
): Promise<Response> {
  // Page endpoints receive an h3 event. Pointing it at the Request makes the
  // Request the one body source for readBody/readFormData.
  const event = createEvent(context.req, context.res);
  event.web = { request, url };
  event.context.params = route.params ?? {};

  const endpoint = await route.importEndpoint();
  const handler = request.method === 'GET' ? endpoint.load : endpoint.action;
  const result = await handler?.({
    params: event.context.params,
    req: context.req,
    res: context.res,
    fetch: serverFetch(url.origin),
    event,
  });
  return result instanceof Response
    ? result
    : Response.json(result ?? {}, { status: context.res.statusCode });
}

async function renderPage(
  manifest: AnalogServerManifest,
  url: URL,
  context: AnalogRequestContext,
): Promise<Response> {
  const path = `${url.pathname}${url.search}`;
  const req = context.req as ServerContext['req'];
  req.originalUrl ??= path;
  const render = await manifest.render();
  const html = await render(path, await indexHtml(path), {
    req,
    res: context.res,
    fetch: serverFetch(url.origin),
  });
  // The status carries anything the app set through RESPONSE while rendering.
  return new Response(html, {
    status: context.res.statusCode,
    headers: { 'content-type': 'text/html; charset=utf-8' },
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
