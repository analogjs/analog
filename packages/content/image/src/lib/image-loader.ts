import { IMAGE_LOADER, ImageLoaderConfig } from '@angular/common';
import { Provider } from '@angular/core';

import {
  ANALOG_IMAGE_CONFIG,
  AnalogImageConfig,
  buildImageUrl,
  isOptimizableSrc,
  mergedImageConfig,
} from './image-config';

/**
 * Provides an `IMAGE_LOADER` for `NgOptimizedImage` that resolves
 * images through the Analog image optimization endpoint.
 *
 * Only local absolute paths and remote images from allowlisted `domains`
 * are routed through the endpoint; all other sources are left untouched.
 *
 * ```ts
 * providers: [
 *   provideImageLoader({ domains: ['images.unsplash.com'] }),
 * ]
 * ```
 */
export function provideImageLoader(
  options: Partial<AnalogImageConfig> = {},
): Provider[] {
  const config: AnalogImageConfig = mergedImageConfig(options);

  return [
    { provide: ANALOG_IMAGE_CONFIG, useValue: config },
    {
      provide: IMAGE_LOADER,
      useValue: (loaderConfig: ImageLoaderConfig) =>
        isOptimizableSrc(config, loaderConfig.src)
          ? buildImageUrl(
              config,
              loaderConfig.src,
              loaderConfig.width,
              // NgOptimizedImage requests the base src without a width;
              // that URL stays in the source format as the fallback.
              loaderConfig.width ? config.format : undefined,
            )
          : loaderConfig.src,
    },
  ];
}
