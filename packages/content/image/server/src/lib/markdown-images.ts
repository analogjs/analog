import type { MarkedExtension } from 'marked';

export interface MarkdownImagesOptions {
  /** Path to the image optimization endpoint. */
  path?: string;
  /** `sizes` attribute emitted on optimized images. */
  sizes?: string;
  /** Widths emitted in the `srcset`. */
  widths?: number[];
  /** Quality passed to the endpoint (1-100). */
  quality?: number;
}

const MARKDOWN_IMAGES_DEFAULTS = {
  path: '/api/_image',
  widths: [640, 768, 1024, 1280, 1920],
};

/**
 * Marked extension that renders markdown images as responsive `<img>`
 * tags served through the image optimization endpoint. Build-time
 * counterpart of `withImageOptimization()` for apps that render content
 * through the vite content plugin.
 *
 * ```ts
 * // vite.config.ts
 * analog({
 *   content: {
 *     markedOptions: { extensions: [markdownImages({ sizes: '100vw' })] },
 *   },
 * })
 * ```
 */
export function markdownImages(
  options: MarkdownImagesOptions = {},
): MarkedExtension {
  const config = { ...MARKDOWN_IMAGES_DEFAULTS, ...options };

  return {
    renderer: {
      image({ href, title, text }) {
        if (!href.startsWith('/')) {
          return `<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}"${
            title ? ` title="${escapeAttr(title)}"` : ''
          } loading="lazy" decoding="async">`;
        }

        const widths = config.widths;
        const srcset = widths
          .map((w) => `${buildUrl(config, href, w)} ${w}w`)
          .join(', ');
        const src = buildUrl(config, href, widths[widths.length - 1]);

        return (
          `<img src="${escapeAttr(src)}" srcset="${escapeAttr(srcset)}"` +
          (config.sizes ? ` sizes="${escapeAttr(config.sizes)}"` : '') +
          ` alt="${escapeAttr(text)}"` +
          (title ? ` title="${escapeAttr(title)}"` : '') +
          ` loading="lazy" decoding="async">`
        );
      },
    },
  };
}

function buildUrl(
  config: { path: string; quality?: number },
  src: string,
  width: number,
): string {
  const params = new URLSearchParams({ src });
  params.set('w', String(width));
  if (config.quality) {
    params.set('q', String(config.quality));
  }
  return `${config.path}?${params.toString()}`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
