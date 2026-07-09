import { Injectable, Provider, inject } from '@angular/core';
import {
  ContentRenderer,
  MarkdownContentRendererService,
  MarkedContentImages,
  MarkedImageToken,
  MarkedSetupService,
} from '@analogjs/content';

import {
  ANALOG_IMAGE_CONFIG,
  AnalogImageConfig,
  IMAGE_CONFIG_DEFAULTS,
  buildImageUrl,
  isOptimizableSrc,
} from './image-config';

@Injectable()
export class OptimizedMarkedImages extends MarkedContentImages {
  private readonly config = inject(ANALOG_IMAGE_CONFIG);

  renderImage({ href, title, text }: MarkedImageToken): string {
    if (!isOptimizableSrc(this.config, href)) {
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
 * Provides runtime markdown rendering with images (`![alt](src)`)
 * rendered as responsive `<img>` tags served through the Analog image
 * optimization endpoint, with `srcset`, lazy loading, and async decoding.
 *
 * Self-contained — provide it in the component that renders the content:
 *
 * ```ts
 * @Component({
 *   imports: [MarkdownComponent],
 *   providers: [
 *     provideOptimizedMarkdownImages({ sizes: '(max-width: 768px) 100vw, 768px' }),
 *   ],
 *   template: `<analog-markdown />`,
 * })
 * ```
 *
 * Apps that render content at build time through the vite content plugin
 * should use the `markdownImages()` extension from
 * `@analogjs/content/image/server` instead.
 */
export function provideOptimizedMarkdownImages(
  options: Partial<AnalogImageConfig> = {},
): Provider[] {
  return [
    {
      provide: ANALOG_IMAGE_CONFIG,
      useValue: { ...IMAGE_CONFIG_DEFAULTS, ...options },
    },
    { provide: MarkedContentImages, useClass: OptimizedMarkedImages },
    MarkedSetupService,
    { provide: ContentRenderer, useClass: MarkdownContentRendererService },
  ];
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
