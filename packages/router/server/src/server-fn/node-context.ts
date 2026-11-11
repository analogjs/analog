import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import type { H3Event } from 'h3';

import type { AnalogRequestContext } from '../request-handler';

type NodeContext = NonNullable<H3Event['node']>;
type NodeRuntimeContext = NodeContext & {
  req: IncomingMessage;
  res: ServerResponse;
};

/**
 * Dispatch provides the Node request and response through `REQUEST` and
 * `RESPONSE`, which are typed as Node primitives. h3 leaves `node` undefined on
 * other runtimes, where `nodeContext` creates them from the `Request`. Calls
 * made in-process while rendering may have no response.
 */
export function assertNodeContext(
  event: Pick<H3Event, 'node'>,
): NodeRuntimeContext {
  const node = event.node;

  if (!node?.req) {
    throw new Error(
      '@analogjs/router: server functions require a Node runtime.',
    );
  }

  return node as NodeRuntimeContext;
}

/**
 * A Node request/response pair for a bare `Request`, carrying what Analog
 * reads: method, URL, headers and protocol, plus the `Request` and its abort
 * `signal`. The same approach as h3's web adapter; it needs `node:http` (Node,
 * Bun, Deno).
 */
export function nodeContext(request: Request, url: URL): AnalogRequestContext {
  const socket = new Socket();
  Object.defineProperty(socket, 'encrypted', {
    value: url.protocol === 'https:',
  });
  const req = new IncomingMessage(socket);
  const path = `${url.pathname}${url.search}`;
  req.method = request.method;
  req.url = path;
  Object.assign(req, { originalUrl: path });
  Object.defineProperties(req, {
    signal: { value: request.signal },
    request: { value: request },
  });
  req.headers = { host: url.host, ...Object.fromEntries(request.headers) };
  return { req, res: new ServerResponse(req) };
}

/** Headers the app set on the created response, under Analog's own. */
export function withResponseHeaders(
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
