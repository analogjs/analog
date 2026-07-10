export interface ImageHandlerOptions {
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
  /** Format fixed in the URL (`f_webp`), bypassing Accept negotiation. */
  format?: ImageFormat;
}

export const IMAGE_HANDLER_DEFAULTS: Required<ImageHandlerOptions> = {
  domains: [],
  maxWidth: 2048,
  formats: ['avif', 'webp'],
  quality: 80,
};

const MODIFIERS_RE = /^(_|[wqf]_[a-z0-9]+(,[wqf]_[a-z0-9]+)*)$/i;

/**
 * Parses the path-encoded form `<modifiers>/<src>`, e.g.
 * `w_640,f_webp/images/hero.png` or
 * `w_640/https%3A%2F%2Fimages.example.com%2Fx.png`.
 *
 * Paths (not query strings) are used so prerendered variants map to
 * real files on static hosts. Throws an Error with a `statusCode`
 * property on invalid input.
 */
export function parseImageRequest(
  path: string,
  options: Required<ImageHandlerOptions>,
): ImageRequest {
  const normalized = path.replace(/^\/+/, '');
  const slash = normalized.indexOf('/');
  if (slash === -1) {
    throw badRequest('expected <modifiers>/<src>');
  }

  const modifiersSegment = normalized.slice(0, slash);
  const rawSrc = normalized.slice(slash + 1);
  if (!MODIFIERS_RE.test(modifiersSegment)) {
    throw badRequest('invalid modifiers');
  }
  if (!rawSrc) {
    throw badRequest('src is required');
  }

  let src: string;
  let remote = false;
  const decodedSrc = safeDecode(rawSrc);
  if (/^https?:\/\//.test(decodedSrc)) {
    let host: string;
    try {
      host = new URL(decodedSrc).hostname;
    } catch {
      throw badRequest('invalid src URL');
    }
    if (!options.domains.includes(host)) {
      throw badRequest('remote host not allowed');
    }
    src = decodedSrc;
    remote = true;
  } else {
    const segments = rawSrc.split('/').map(safeDecode);
    if (segments.some((segment) => segment === '..' || segment === '')) {
      throw badRequest('invalid src path');
    }
    src = '/' + segments.join('/');
  }

  let width: number | undefined;
  let quality = options.quality;
  let format: ImageFormat | undefined;

  if (modifiersSegment !== '_') {
    for (const modifier of modifiersSegment.split(',')) {
      const value = modifier.slice(2);
      switch (modifier[0]) {
        case 'w': {
          width = Number(value);
          if (!Number.isInteger(width) || width <= 0) {
            throw badRequest('w must be a positive integer');
          }
          width = Math.min(width, options.maxWidth);
          break;
        }
        case 'q': {
          quality = Number(value);
          if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
            throw badRequest('q must be an integer between 1 and 100');
          }
          break;
        }
        case 'f': {
          if (value !== 'avif' && value !== 'webp') {
            throw badRequest('f must be avif or webp');
          }
          format = value;
          break;
        }
      }
    }
  }

  return { src, remote, width, quality, format };
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

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw badRequest('invalid encoding');
  }
}

function badRequest(message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}
