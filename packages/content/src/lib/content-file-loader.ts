import { InjectionToken, Provider } from '@angular/core';
import { inject } from '@angular/core';

import { injectContentFilesMap } from './inject-content-files';

type ContentFileLoaderFunction = () => Promise<
  Record<string, () => Promise<string>>
>;

export const CONTENT_FILE_LOADER =
  new InjectionToken<ContentFileLoaderFunction>(
    '@analogjs/content/resource File Loader',
  );

export function injectContentFileLoader() {
  return inject(CONTENT_FILE_LOADER) as ContentFileLoaderFunction;
}

export function withContentFileLoader(): Provider {
  return {
    provide: CONTENT_FILE_LOADER,
    useFactory() {
      return async () => injectContentFilesMap();
    },
  };
}
