import { resource } from '@angular/core';
import {
  injectContentListLoader,
  InjectContentFilesFilterFunction,
} from '@analogjs/content';

export function contentFilesResource<Attributes extends Record<string, any>>(
  filterFn?: InjectContentFilesFilterFunction<Attributes> | undefined,
) {
  const contentListLoader = injectContentListLoader<Attributes>();
  const contentList = contentListLoader().then((items) =>
    filterFn ? items.filter(filterFn) : items,
  );

  return resource({
    loader: () => contentList,
  });
}
