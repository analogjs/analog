import { InjectionToken, inject } from '@angular/core';

export interface AnalogImageConfig {
  /** Path to the image optimization endpoint. */
  path: string;
  /** Default `sizes` attribute for markdown-rendered images. */
  sizes?: string;
  /** Widths emitted in the markdown `srcset`. */
  widths: number[];
  /** Default quality passed to the endpoint (1-100). */
  quality?: number;
}

export const IMAGE_CONFIG_DEFAULTS: AnalogImageConfig = {
  path: '/api/_image',
  widths: [640, 768, 1024, 1280, 1920],
};

export const ANALOG_IMAGE_CONFIG = new InjectionToken<AnalogImageConfig>(
  'ANALOG_IMAGE_CONFIG',
  { factory: () => IMAGE_CONFIG_DEFAULTS },
);

export function injectImageConfig(): AnalogImageConfig {
  return inject(ANALOG_IMAGE_CONFIG);
}

export function buildImageUrl(
  config: AnalogImageConfig,
  src: string,
  width?: number,
): string {
  const params = new URLSearchParams({ src });
  if (width) {
    params.set('w', String(width));
  }
  if (config.quality) {
    params.set('q', String(config.quality));
  }
  return `${config.path}?${params.toString()}`;
}
