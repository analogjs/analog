import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

function toWebHeaders(headers: IncomingHttpHeaders) {
  return Object.entries(headers).reduce((acc, [key, value]) => {
    if (value && !key.startsWith(':')) {
      acc.set(key, Array.isArray(value) ? value.join(', ') : value);
    }

    return acc;
  }, new Headers());
}

export function toWebRequest(req: IncomingMessage): Request {
  const protocol = 'http';
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `${protocol}://${host}`);
  const body =
    req.method && !['GET', 'HEAD'].includes(req.method)
      ? (Readable.toWeb(req) as ReadableStream<Uint8Array>)
      : undefined;

  return new Request(url, {
    method: req.method,
    headers: toWebHeaders(req.headers),
    body,
    // @ts-expect-error duplex is required for streaming request bodies in Node.js
    duplex: body ? 'half' : undefined,
  });
}

function isClientDisconnectError(error: unknown, res: ServerResponse): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const hasDisconnectCode =
    'code' in error &&
    typeof error.code === 'string' &&
    [
      'ERR_STREAM_PREMATURE_CLOSE',
      'ERR_INVALID_STATE',
      'ECONNRESET',
      'EPIPE',
    ].includes(error.code);

  const hasDisconnectMessage = /closed or destroyed stream/i.test(
    error.message,
  );

  return (
    (res.destroyed || res.writableEnded) &&
    (hasDisconnectCode || hasDisconnectMessage)
  );
}

export async function writeWebResponseToNode(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;

  const setCookies =
    'getSetCookie' in response.headers &&
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];

  if (setCookies.length > 0) {
    res.setHeader('set-cookie', setCookies);
  }

  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') {
      res.setHeader(key, value);
    }
  });

  if (!response.body) {
    res.end();
    return;
  }

  // The Web ReadableStream and Node.js stream/web ReadableStream types
  // are structurally identical at runtime but TypeScript treats them as
  // distinct nominal types. The double-cast bridges this gap safely.
  try {
    await pipeline(
      Readable.fromWeb(
        response.body as unknown as import('node:stream/web').ReadableStream,
      ),
      res,
    );
  } catch (error) {
    // Long-lived dev responses such as SSE can be interrupted by a browser
    // refresh or HMR-triggered reconnect. Those closed-stream cases are
    // expected and should not surface as noisy server errors.
    if (isClientDisconnectError(error, res)) {
      return;
    }

    throw error;
  }
}
