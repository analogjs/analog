import { NgOptimizedImage } from '@angular/common';
import {
  Component,
  booleanAttribute,
  input,
  numberAttribute,
} from '@angular/core';

/**
 * Optimized image component that renders a single `<img>` element
 * through `NgOptimizedImage` and the Analog image loader.
 *
 * The host element generates no layout box (`display: contents`), so the
 * rendered `<img>` participates in the parent's layout directly.
 *
 * ```html
 * <Image src="/images/hero.png" width="1200" height="630" priority />
 * ```
 */
@Component({
  selector: 'Image,analog-image',
  imports: [NgOptimizedImage],
  host: { style: 'display: contents' },
  template: `
    @if (fill()) {
      <img
        [ngSrc]="src()"
        [alt]="alt()"
        [sizes]="sizes()"
        [priority]="priority()"
        [loaderParams]="loaderParams() ?? {}"
        fill
      />
    } @else {
      <img
        [ngSrc]="src()"
        [alt]="alt()"
        [width]="width()"
        [height]="height()"
        [sizes]="sizes()"
        [priority]="priority()"
        [loaderParams]="loaderParams() ?? {}"
      />
    }
  `,
})
export class Image {
  src = input.required<string>();
  alt = input('');
  width = input(undefined, { transform: numberAttribute });
  height = input(undefined, { transform: numberAttribute });
  sizes = input<string | undefined>(undefined);
  priority = input(false, { transform: booleanAttribute });
  fill = input(false, { transform: booleanAttribute });
  loaderParams = input<Record<string, unknown> | undefined>(undefined);
}
