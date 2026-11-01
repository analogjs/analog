import type { Injector } from '@angular/core';
import type { ServerContext } from '@analogjs/router/tokens';
import * as h3 from 'h3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { $fetch } from 'ofetch';
import { createRouter } from 'radix3';

import { createServerFnAppInjector } from './server-fn/app-injector';
import { dispatchServerFn } from './server-fn/dispatch';
import {
  ANALOG_SERVER_MANIFEST,
  type AnalogServerManifest,
  type PageEndpointModule,
} from './server-manifest';

/**
 * The Node request and response behind a `Request`, when the host has them.
 * They become Analog's `REQUEST`/`RESPONSE` and the page endpoint `req`/`res`.
 */
export type AnalogRequestContext = {
  req: IncomingMessage;
  res: ServerResponse;
};

/**
 * A `Response` for Analog's requests, or `null` for anything else. Without a
 * context (fetch-native hosts), a Node request/response pair is created from
 * the `Request`, and what the app sets on that response is folded into the
 * returned `Response`.
 */
export type AnalogRequestHandler = (
  request: Request,
  context?: AnalogRequestContext,
) => Promise<Response | null>;

type PageRoute = { importEndpoint: () => Promise<PageEndpointModule> };

const SERVER_FN_PREFIX = '/_analog/fn/';

/**
 * Handles Analog's requests: server functions and page endpoints, then SSR
 * for GET requests outside the API prefix. Static client files are the
 * host's job; serve them first, without an index fallback, or SSR answers
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

  async function route(
    request: Request,
    url: URL,
    context: AnalogRequestContext,
  ): Promise<Response | null> {
    if (url.pathname.startsWith(SERVER_FN_PREFIX)) {
      const id = url.pathname.slice(SERVER_FN_PREFIX.length);
      return callServerFn(id, request, context, await appInjector);
    }
    if (url.pathname.startsWith(pageEndpointPrefix)) {
      const match = pageRoutes.lookup(url.pathname);
      return match ? callPageEndpoint(match, request, url, context) : null;
    }
    if (request.method === 'GET' && !url.pathname.startsWith(apiPrefix)) {
      return renderPage(manifest, url, context);
    }
    return null;
  }

  return async (request, context) => {
    const url = new URL(request.url);
    if (context) {
      return route(request, url, context);
    }
    const created = nodeContext(request, url);
    const response = await route(request, url, created);
    return response && withResponseHeaders(response, created.res);
  };
}

function serverManifest(): AnalogServerManifest {
  if (!ANALOG_SERVER_MANIFEST.render) {
    throw new Error(
      '[@analogjs/router] createAnalogRequestHandler() needs the server build from `analog({ server })`, which fills in the server manifest.',
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
  match: PageRoute & { params?: Record<string, string> },
  request: Request,
  url: URL,
  context: AnalogRequestContext,
): Promise<Response> {
  const event = pageEndpointEvent(request, url, context);
  event.context.params = match.params ?? {};

  const endpoint = await match.importEndpoint();
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

/**
 * Page endpoints receive an h3 event, backed by the `Request` so it is the
 * one body source: h3 v1 reads `event.web.request`, h3 v2 wraps the request.
 */
function pageEndpointEvent(
  request: Request,
  url: URL,
  context: AnalogRequestContext,
): h3.H3Event {
  if ('createEvent' in h3) {
    const event = h3.createEvent(context.req, context.res);
    event.web = { request, url };
    return event;
  }
  const { H3Event } = h3 as unknown as {
    H3Event: new (request: Request) => h3.H3Event;
  };
  return new H3Event(request);
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
  const html = await render(path, await manifest.template(path), {
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
 * get it as `fetch`, and the router's SSR interceptor uses its `.raw()` and
 * records the responses in TransferState.
 */
function serverFetch(origin: string): typeof $fetch {
  return $fetch.create({ baseURL: origin });
}

/**
 * A Node request/response pair for a bare `Request`, carrying what Analog
 * reads: method, URL, headers and protocol. The same approach as h3's web
 * adapter; it needs `node:http` (Node, Bun, Deno).
 */
function nodeContext(request: Request, url: URL): AnalogRequestContext {
  const socket = new Socket();
  Object.defineProperty(socket, 'encrypted', {
    value: url.protocol === 'https:',
  });
  const req = new IncomingMessage(socket);
  const path = `${url.pathname}${url.search}`;
  req.method = request.method;
  req.url = path;
  Object.assign(req, { originalUrl: path });
  req.headers = { host: url.host, ...Object.fromEntries(request.headers) };
  return { req, res: new ServerResponse(req) };
}

/** Headers the app set on the created response, under Analog's own. */
function withResponseHeaders(
  response: Response,
  res: ServerResponse,
): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.getHeaders())) {
    for (const item of [value ?? []].flat()) {
      headers.append(key, String(item));
    }
  }
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') {
      headers.set(key, value);
    }
  });
  for (const cookie of response.headers.getSetCookie()) {
    headers.append('set-cookie', cookie);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
