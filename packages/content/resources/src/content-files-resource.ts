import { resource, ResourceRef } from '@angular/core';
import {
  ContentFile,
  injectContentListLoader,
  InjectContentFilesFilterFunction,
} from '@analogjs/content';

export function contentFilesResource<Attributes extends Record<string, any>>(
  filterFn?: InjectContentFilesFilterFunction<Attributes> | undefined,
): ResourceRef<ContentFile<Attributes>[] | undefined> {
  const contentListLoader = injectContentListLoader<Attributes>();
  const contentList = contentListLoader().then((items) =>
    filterFn ? items.filter(filterFn) : items,
  );

  return resource({
    loader: () => contentList,
  });
}
