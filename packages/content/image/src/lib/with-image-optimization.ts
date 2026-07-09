import { Injectable, Provider, inject } from '@angular/core';
import { MarkedContentImages, MarkedImageToken } from '@analogjs/content';

import {
  ANALOG_IMAGE_CONFIG,
  AnalogImageConfig,
  IMAGE_CONFIG_DEFAULTS,
  buildImageUrl,
} from './image-config';

@Injectable()
export class OptimizedMarkedImages extends MarkedContentImages {
  private readonly config = inject(ANALOG_IMAGE_CONFIG);

  renderImage({ href, title, text }: MarkedImageToken): string {
    // Only local images go through the optimizer; remote and data URLs
    // are emitted as-is (still lazy) unless the endpoint allows remotes.
    if (!href.startsWith('/')) {
      return `<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}"${
        title ? ` title="${escapeAttr(title)}"` : ''
      } loading="lazy" decoding="async">`;
    }

    const widths = this.config.widths;
    const srcset = widths
      .map((w) => `${buildImageUrl(this.config, href, w)} ${w}w`)
      .join(', ');
    const src = buildImageUrl(this.config, href, widths[widths.length - 1]);

    return (
      `<img src="${escapeAttr(src)}" srcset="${escapeAttr(srcset)}"` +
      (this.config.sizes ? ` sizes="${escapeAttr(this.config.sizes)}"` : '') +
      ` alt="${escapeAttr(text)}"` +
      (title ? ` title="${escapeAttr(title)}"` : '') +
      ` loading="lazy" decoding="async">`
    );
  }
}

/**
 * Content feature that renders markdown images (`![alt](src)`) as
 * responsive `<img>` tags served through the Analog image optimization
 * endpoint, with `srcset`, lazy loading, and async decoding.
 *
 * ```ts
 * provideContent(
 *   withMarkdownRenderer(),
 *   withImageOptimization({ sizes: '(max-width: 768px) 100vw, 768px' }),
 * )
 * ```
 */
export function withImageOptimization(
  options: Partial<AnalogImageConfig> = {},
): Provider[] {
  return [
    {
      provide: ANALOG_IMAGE_CONFIG,
      useValue: { ...IMAGE_CONFIG_DEFAULTS, ...options },
    },
    { provide: MarkedContentImages, useClass: OptimizedMarkedImages },
  ];
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
