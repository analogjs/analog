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
  /**
   * Remote hosts routed through the endpoint. Must mirror the handler's
   * `domains` allowlist. Remote images from other hosts are left
   * untouched.
   */
  domains?: string[];
}

export const IMAGE_CONFIG_DEFAULTS: AnalogImageConfig = {
  path: '/api/_image',
  widths: [640, 768, 1024, 1280, 1920],
};

/**
 * Whether a `src` should be routed through the optimization endpoint:
 * local absolute paths always; remote URLs only when the host is
 * allowlisted; everything else (data/blob URLs, relative paths) never.
 */
export function isOptimizableSrc(
  config: AnalogImageConfig,
  src: string,
): boolean {
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
