import { inject } from '@angular/core';

import { ContentFile } from './content-file';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';
import { CONTENT_FILES_TOKEN } from './content-files-token';
import { CONTENT_LOCALE, filterByLocale } from './content-locale';
import { RenderTaskService } from './render-task.service';

export function injectContentFiles<Attributes extends Record<string, any>>(
  filterFn?: InjectContentFilesFilterFunction<Attributes>,
): ContentFile<Attributes>[] {
  const renderTaskService = inject(RenderTaskService);
  const task = renderTaskService.addRenderTask();
  const allContentFiles = inject(
    CONTENT_FILES_LIST_TOKEN,
  ) as ContentFile<Attributes>[];
  const locale = inject(CONTENT_LOCALE, { optional: true });
  renderTaskService.clearRenderTask(task);

  let results = allContentFiles;

  if (locale) {
    results = filterByLocale(results, locale);
  }

  if (filterFn) {
    results = results.filter(filterFn);
  }

  return results;
}

export type InjectContentFilesFilterFunction<T extends Record<string, any>> = (
  value: ContentFile<T>,
  index: number,
  array: ContentFile<T>[],
) => boolean;

export function injectContentFilesMap(): Record<string, () => Promise<string>> {
  return inject(CONTENT_FILES_TOKEN);
}
