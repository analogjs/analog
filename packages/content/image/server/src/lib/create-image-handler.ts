import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  createError,
  defineEventHandler,
  getQuery,
  getRequestHeader,
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
 * Usage in `src/server/routes/api/_image.get.ts`:
 * ```ts
 * import { createImageHandler } from '@analogjs/content/image/server';
 *
 * export default createImageHandler({ dir: 'public' });
 * ```
 */
export function createImageHandler(options: ImageHandlerOptions = {}) {
  const config = { ...IMAGE_HANDLER_DEFAULTS, ...options };
  const root = resolve(config.dir);

  return defineEventHandler(async (event) => {
    let request;
    try {
      request = parseImageRequest(getQuery(event), config);
    } catch (e) {
      throw createError({
        statusCode: (e as { statusCode?: number }).statusCode ?? 400,
        statusMessage: (e as Error).message,
      });
    }

    let source: Buffer;
    if (request.remote) {
      const response = await fetch(request.src);
      if (!response.ok) {
        throw createError({ statusCode: 404, statusMessage: 'not found' });
      }
      source = Buffer.from(await response.arrayBuffer());
    } else {
      const filePath = resolve(join(root, request.src));
      if (!filePath.startsWith(root)) {
        throw createError({ statusCode: 400, statusMessage: 'invalid path' });
      }
      try {
        source = await readFile(filePath);
      } catch {
        throw createError({ statusCode: 404, statusMessage: 'not found' });
      }
    }

    const format = negotiateFormat(
      getRequestHeader(event, 'accept'),
      config.formats,
    );

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
    setHeader(event, 'Vary', 'Accept');

    return data;
  });
}
