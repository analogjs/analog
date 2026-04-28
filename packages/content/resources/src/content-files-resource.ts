import { resource } from '@angular/core';
import {
  injectContentListLoader,
  InjectContentFilesFilterFunction,
  filterByLocale,
  injectContentLocale,
} from '@analogjs/content';

export function contentFilesResource<Attributes extends Record<string, any>>(
  filterFn?: InjectContentFilesFilterFunction<Attributes> | undefined,
) {
  const contentListLoader = injectContentListLoader<Attributes>();
  const locale = injectContentLocale();
  const contentList = contentListLoader().then((items) => {
    let results = locale ? filterByLocale(items, locale) : items;
    if (filterFn) {
      results = results.filter(filterFn);
    }
    return results;
  });

  return resource({
    loader: () => contentList,
  });
}
