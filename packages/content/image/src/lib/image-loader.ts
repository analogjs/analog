import { IMAGE_LOADER, ImageLoaderConfig } from '@angular/common';
import { Provider } from '@angular/core';

import {
  ANALOG_IMAGE_CONFIG,
  AnalogImageConfig,
  IMAGE_CONFIG_DEFAULTS,
  buildImageUrl,
} from './image-config';

/**
 * Provides an `IMAGE_LOADER` for `NgOptimizedImage` (and the `<Image />`
 * component) that resolves images through the Analog image optimization
 * endpoint.
 *
 * ```ts
 * providers: [provideImageLoader({ path: '/api/_image' })]
 * ```
 */
export function provideImageLoader(
  options: Partial<AnalogImageConfig> = {},
): Provider[] {
  const config: AnalogImageConfig = { ...IMAGE_CONFIG_DEFAULTS, ...options };

  return [
    { provide: ANALOG_IMAGE_CONFIG, useValue: config },
    {
      provide: IMAGE_LOADER,
      useValue: (loaderConfig: ImageLoaderConfig) =>
        buildImageUrl(config, loaderConfig.src, loaderConfig.width),
    },
  ];
}
