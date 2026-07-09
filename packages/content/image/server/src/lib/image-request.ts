export interface ImageHandlerOptions {
  /** Directory local images are served from, relative to the server cwd. */
  dir?: string;
  /** Allowlisted remote hosts. Empty (default) disables remote images. */
  domains?: string[];
  /** Maximum width a client may request. */
  maxWidth?: number;
  /** Output formats negotiated via the Accept header, best first. */
  formats?: ImageFormat[];
  /** Default quality when the request does not specify one. */
  quality?: number;
}

export type ImageFormat = 'avif' | 'webp';

export interface ImageRequest {
  src: string;
  remote: boolean;
  width?: number;
  quality: number;
}

export const IMAGE_HANDLER_DEFAULTS: Required<ImageHandlerOptions> = {
  dir: 'public',
  domains: [],
  maxWidth: 2048,
  formats: ['avif', 'webp'],
  quality: 80,
};

/**
 * Validates raw query parameters into an image request.
 * Throws an Error with a `statusCode` property on invalid input.
 */
export function parseImageRequest(
  query: Record<string, unknown>,
  options: Required<ImageHandlerOptions>,
): ImageRequest {
  const src = typeof query['src'] === 'string' ? query['src'] : '';
  if (!src) {
    throw badRequest('src is required');
  }

  let remote = false;
  if (/^https?:\/\//.test(src)) {
    let host: string;
    try {
      host = new URL(src).hostname;
    } catch {
      throw badRequest('invalid src URL');
    }
    if (!options.domains.includes(host)) {
      throw badRequest('remote host not allowed');
    }
    remote = true;
  } else {
    if (!src.startsWith('/')) {
      throw badRequest('src must be an absolute path or an allowed URL');
    }
    if (src.split('/').some((segment) => segment === '..')) {
      throw badRequest('invalid src path');
    }
  }

  let width: number | undefined;
  if (query['w'] !== undefined) {
    width = Number(query['w']);
    if (!Number.isInteger(width) || width <= 0) {
      throw badRequest('w must be a positive integer');
    }
    width = Math.min(width, options.maxWidth);
  }

  let quality = options.quality;
  if (query['q'] !== undefined) {
    quality = Number(query['q']);
    if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
      throw badRequest('q must be an integer between 1 and 100');
    }
  }

  return { src, remote, width, quality };
}

/**
 * Picks the best output format the client accepts, or null to keep the
 * source format.
 */
export function negotiateFormat(
  acceptHeader: string | undefined,
  formats: ImageFormat[],
): ImageFormat | null {
  if (!acceptHeader) return null;
  for (const format of formats) {
    if (acceptHeader.includes(`image/${format}`)) {
      return format;
    }
  }
  return null;
}

function badRequest(message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}
