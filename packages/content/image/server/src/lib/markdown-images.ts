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
  /**
   * Remote hosts routed through the endpoint. Must mirror the handler's
   * `domains` allowlist. Remote images from other hosts are left
   * untouched.
   */
  domains?: string[];
  /**
   * Format fixed into srcset URLs instead of Accept negotiation.
   * Required for static hosting. The base `src` keeps the source format
   * as a fallback for browsers without srcset support.
   */
  format?: 'avif' | 'webp';
}

const MARKDOWN_IMAGES_DEFAULTS = {
  path: '/api/_image',
  widths: [640, 768, 1024, 1280, 1920],
};

/**
 * Marked extension that renders markdown images as responsive `<img>`
 * tags served through the image optimization endpoint. Build-time
 * counterpart of `provideOptimizedMarkdownImages()` for apps that render
 * content through the vite content plugin. Registered automatically by
 * the Analog platform plugin's `content.images` option.
 */
export function markdownImages(
  options: MarkdownImagesOptions = {},
): MarkedExtension {
  const config = { ...MARKDOWN_IMAGES_DEFAULTS, ...options };

  return {
    renderer: {
      image({ href, title, text }) {
        if (!isOptimizable(config, href)) {
          return `<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}"${
            title ? ` title="${escapeAttr(title)}"` : ''
          } loading="lazy" decoding="async">`;
        }

        const widths = config.widths;
        const srcset = widths
          .map((w) => `${buildUrl(config, href, w, config.format)} ${w}w`)
          .join(', ');
        // The base src keeps the source format as the srcset-less fallback
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

function isOptimizable(config: { domains?: string[] }, src: string): boolean {
  if (src.startsWith('/')) {
    return true;
  }
  if (/^https?:\/\//.test(src)) {
    try {
      return !!config.domains?.includes(new URL(src).hostname);
    } catch {
      return false;
    }
  }
  return false;
}

function buildUrl(
  config: { path: string; quality?: number },
  src: string,
  width: number,
  format?: 'avif' | 'webp',
): string {
  const modifiers = [
    `w_${width}`,
    config.quality ? `q_${config.quality}` : '',
    format ? `f_${format}` : '',
  ]
    .filter(Boolean)
    .join(',');
  const source = src.startsWith('/')
    ? src.split('/').map(encodeURIComponent).join('/')
    : `/${encodeURIComponent(src)}`;
  return `${config.path}/${modifiers}${source}`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
