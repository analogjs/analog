import { resource, ResourceRef } from '@angular/core';
import type { ContentFile } from '../../src/lib/content-file';
import type { InjectContentFilesFilterFunction } from '../../src/lib/inject-content-files';
import { injectContentListLoader } from '../../src/lib/content-list-loader';

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
