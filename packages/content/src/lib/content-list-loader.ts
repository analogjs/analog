import { InjectionToken, Provider } from '@angular/core';
import { inject } from '@angular/core';

import { ContentFile } from './content-file';
import { injectContentFiles } from './inject-content-files';

type ContentListLoaderFunction<Attributes extends Record<string, any>> =
  () => Promise<ContentFile<Attributes>[]>;

export const CONTENT_LIST_LOADER = new InjectionToken<
  ContentListLoaderFunction<any>
>('@analogjs/content/resource List Loader');

export function injectContentListLoader<
  Attributes extends Record<string, any>,
>() {
  return inject(CONTENT_LIST_LOADER) as ContentListLoaderFunction<Attributes>;
}

export function withContentListLoader(): Provider {
  return {
    provide: CONTENT_LIST_LOADER,
    useFactory() {
      return async () => injectContentFiles();
    },
  };
}
