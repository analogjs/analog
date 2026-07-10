import { H3Event, appendResponseHeader, getRequestHeader } from 'h3';

export interface ImagePrerenderOptions {
  /** Path to the image optimization endpoint. */
  path?: string;
}

/**
 * Extracts local image variant URLs (`<path>/<modifiers>/<src>`) from
 * rendered HTML. Remote-source variants are skipped — their decoded
 * URLs contain query strings, which nitro cannot write as static files;
 * they stay runtime-served.
 */
export function extractImageUrls(html: string, path: string): string[] {
  const matcher = new RegExp(`${escapeRegExp(path)}/[^"'\\s\\\\]+`, 'g');
  const urls = new Set<string>();
  for (const match of html.matchAll(matcher)) {
    if (/https?%3A/i.test(match[0])) {
      continue;
    }
    urls.add(match[0]);
  }
  return [...urls];
}

/**
 * Nitro runtime plugin that queues image variants for prerendering.
 * During a prerender pass (detected via the request's
 * `x-nitro-prerender` header), rendered HTML is scanned for variant
 * URLs, which are appended to the response's `x-nitro-prerender`
 * header — nitro generates each one as a static file.
 *
 * Registered automatically by the Analog platform plugin's
 * `content.images` option.
 */
export function createImagePrerenderPlugin(
  options: ImagePrerenderOptions = {},
) {
  const path = options.path ?? '/api/_image';

  return (nitroApp: {
    hooks: {
      hook: (
        name: string,
        fn: (event: H3Event, response: { body?: unknown }) => void,
      ) => void;
    };
  }) => {
    nitroApp.hooks.hook('beforeResponse', (event, response) => {
      if (!getRequestHeader(event, 'x-nitro-prerender')) {
        return;
      }
      const body = response.body;
      if (typeof body !== 'string' || !body.includes(`${path}/`)) {
        return;
      }
      const urls = extractImageUrls(body, path);
      if (urls.length) {
        appendResponseHeader(
          event,
          'x-nitro-prerender',
          // one encoded entry per URL — modifiers contain commas, and
          // nitro splits this header on commas before decoding
          urls.map((url) => encodeURIComponent(url)).join(','),
        );
      }
    });
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
