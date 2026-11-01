import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { TLSSocket } from 'node:tls';

import { createAnalogRequestHandler } from './request-handler';

export type AnalogNodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

/**
 * The Node adapter for `createAnalogRequestHandler()`: converts the request,
 * writes Analog's `Response`, and calls `next` when Analog returns `null`.
 */
export function createAnalogHandler(): AnalogNodeHandler {
  const handleAnalogRequest = createAnalogRequestHandler();
  return (req, res, next) => {
    handleAnalogRequest(toRequest(req), { req, res })
      .then((response) => (response ? writeResponse(response, res) : next()))
      .catch(next);
  };
}

function toRequest(req: IncomingMessage): Request {
  const protocol = (req.socket as TLSSocket).encrypted ? 'https' : 'http';
  const path = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '/';
  const url = new URL(path, `${protocol}://${req.headers.host ?? 'localhost'}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    for (const item of [value ?? []].flat()) {
      headers.append(key, item);
    }
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? requestBody(req) : undefined,
    duplex: 'half',
  } as RequestInit);
}

/**
 * Hosts whose body parsers run first keep the original bytes on `rawBody`
 * (NestJS with `rawBody: true`). Otherwise the stream is read lazily, so a
 * request passed on with `next()` keeps its body.
 */
function requestBody(req: IncomingMessage): BodyInit {
  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  if (rawBody) {
    return new Uint8Array(rawBody);
  }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        // Checked on read, so requests Analog passes on still reach `next()`.
        if (!reader && req.readableEnded) {
          throw new Error(
            '[@analogjs/router] The request body was already read by another parser. Keep the raw body (NestJS: `rawBody: true`) or mount Analog before body parsers.',
          );
        }
        reader ??= (
          Readable.toWeb(req) as ReadableStream<Uint8Array>
        ).getReader();
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      },
      cancel: (reason) => reader?.cancel(reason),
    },
    { highWaterMark: 0 },
  );
}

/** Keeps headers the app already set on `res`; cookies are appended. */
async function writeResponse(
  response: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') {
      res.setHeader(key, value);
    }
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) {
    res.appendHeader('set-cookie', cookies);
  }
  if (!response.body) {
    res.end();
    return;
  }
  await pipeline(
    Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
    res,
  );
}
