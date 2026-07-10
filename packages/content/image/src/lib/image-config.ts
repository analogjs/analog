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
 * Config serialized by the Analog vite plugin's `content.images` option
 * into `VITE_ANALOG_IMAGES`, so client and server share one source of
 * truth. Read via import.meta.env in bundled code and process.env in
 * externalized SSR modules.
 */
export function envImageConfig(): Partial<AnalogImageConfig> {
  try {
    const raw =
      (import.meta as { env?: Record<string, string> }).env?.[
        'VITE_ANALOG_IMAGES'
      ] ??
      (globalThis as { process?: { env?: Record<string, string> } }).process
        ?.env?.['VITE_ANALOG_IMAGES'];
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function mergedImageConfig(
  options: Partial<AnalogImageConfig>,
): AnalogImageConfig {
  return { ...IMAGE_CONFIG_DEFAULTS, ...envImageConfig(), ...options };
}

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

/**
 * Builds a path-encoded variant URL: `<path>/<modifiers>/<src>`, e.g.
 * `/api/_image/w_640/images/hero.png`. Paths (not query strings) are
 * used so prerendered variants map to real files on static hosts.
 */
export function buildImageUrl(
  config: AnalogImageConfig,
  src: string,
  width?: number,
): string {
  const modifiers = [
    width ? `w_${width}` : '',
    config.quality ? `q_${config.quality}` : '',
  ]
    .filter(Boolean)
    .join(',');
  const source = src.startsWith('/')
    ? src.split('/').map(encodeURIComponent).join('/')
    : `/${encodeURIComponent(src)}`;
  return `${config.path}/${modifiers || '_'}${source}`;
}
