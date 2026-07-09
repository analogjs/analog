import { Injectable } from '@angular/core';

export interface MarkedImageToken {
  href: string;
  title: string | null;
  text: string;
}

/**
 * Optional hook for customizing how markdown images are rendered.
 * Provide an implementation (e.g. via `withImageOptimization()` from
 * `@analogjs/content/image`) to replace the default `<img>` output.
 */
@Injectable()
export abstract class MarkedContentImages {
  abstract renderImage(token: MarkedImageToken): string;
}
