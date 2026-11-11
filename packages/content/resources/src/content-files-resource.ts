import { resource, ResourceRef } from '@angular/core';
import type { ContentFile } from '../../src/lib/content-file';
import {
  filterByLocale,
  injectContentLocale,
} from '../../src/lib/content-locale';
import type { InjectContentFilesFilterFunction } from '../../src/lib/inject-content-files';
import { injectContentListLoader } from '../../src/lib/content-list-loader';

export function contentFilesResource<Attributes extends Record<string, any>>(
  filterFn?: InjectContentFilesFilterFunction<Attributes> | undefined,
): ResourceRef<ContentFile<Attributes>[] | undefined> {
  const contentListLoader = injectContentListLoader<Attributes>();
  const locale = injectContentLocale();

  return resource({
    loader: async () => {
      const items = await contentListLoader();
      const results = locale ? filterByLocale(items, locale) : items;
      return filterFn ? results.filter(filterFn) : results;
    },
  });
}
