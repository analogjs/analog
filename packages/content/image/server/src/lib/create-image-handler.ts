import {
  H3Event,
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
  getRouterParam,
  setHeader,
} from 'h3';
import sharp from 'sharp';

import {
  IMAGE_HANDLER_DEFAULTS,
  ImageHandlerOptions,
  negotiateFormat,
  parseImageRequest,
} from './image-request';

const CONTENT_TYPES: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

/**
 * Creates an h3 event handler that serves optimized images.
 *
 * Local images are fetched through the app's own static serving
 * (Nitro's public assets in production, the dev server in development),
 * so no filesystem configuration is required.
 */
export function createImageHandler(options: ImageHandlerOptions = {}) {
  const config = { ...IMAGE_HANDLER_DEFAULTS, ...options };

  return defineEventHandler(async (event) => {
    let request;
    try {
      request = parseImageRequest(getRouterParam(event, '_') ?? '', config);
    } catch (e) {
      throw createError({
        statusCode: (e as { statusCode?: number }).statusCode ?? 400,
        statusMessage: (e as Error).message,
      });
    }

    const source = request.remote
      ? await fetchRemote(request.src)
      : await fetchLocal(event, request.src);

    const format =
      request.format ??
      negotiateFormat(getRequestHeader(event, 'accept'), config.formats);

    let pipeline = sharp(source);
    if (request.width) {
      pipeline = pipeline.resize(request.width, undefined, {
        withoutEnlargement: true,
      });
    }
    if (format) {
      pipeline = pipeline.toFormat(format, { quality: request.quality });
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    // sharp reports avif output as 'heif', so prefer the negotiated format
    const contentType =
      (format && CONTENT_TYPES[format]) ??
      CONTENT_TYPES[info.format] ??
      'application/octet-stream';
    setHeader(event, 'Content-Type', contentType);
    setHeader(
      event,
      'Cache-Control',
      'public, immutable, no-transform, max-age=31536000',
    );
    if (!request.format) {
      // Response only varies by Accept when the format was negotiated
      setHeader(event, 'Vary', 'Accept');
    }

    return data;
  });
}

async function fetchRemote(src: string): Promise<Buffer> {
  const response = await fetch(src);
  if (!response.ok) {
    throw createError({ statusCode: 404, statusMessage: 'not found' });
  }
  return Buffer.from(await response.arrayBuffer());
}

async function fetchLocal(event: H3Event, src: string): Promise<Buffer> {
  // event.fetch is bound to the nitro app's internal fetch and serves
  // the app's public assets in production and during prerendering.
  const eventFetch = (event as { fetch?: (url: string) => Promise<Response> })
    .fetch;
  if (eventFetch) {
    const response = await eventFetch(src);
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
  }

  // Development: static assets are served by the dev server, not the
  // nitro instance handling this request.
  try {
    const { origin } = getRequestURL(event);
    const response = await fetch(new URL(src, origin));
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
  } catch {
    // no origin server (e.g. prerendering) — treat as not found
  }
  throw createError({ statusCode: 404, statusMessage: 'not found' });
}
