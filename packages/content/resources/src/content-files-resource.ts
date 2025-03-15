import { resource } from '@angular/core';
import {
  injectContentListLoader,
  InjectContentFilesFilterFunction,
} from '@analogjs/content';

import { toSignal } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';

export function contentFilesResource<Attributes extends Record<string, any>>(
  filterFn?: InjectContentFilesFilterFunction<Attributes> | undefined,
) {
  const contentListLoader = injectContentListLoader<Attributes>();
  const contentList = toSignal(
    from(
      contentListLoader().then((items) =>
        filterFn ? items.filter(filterFn) : items,
      ),
    ),
  );

  return resource({
    params: contentList,
    loader: async ({ params: list }) => list,
  });
}
