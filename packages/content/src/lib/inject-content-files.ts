import { ContentFile } from './content-file';
import { inject } from '@angular/core';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';
import { RenderTaskService } from './render-task.service';

export function injectContentFiles<Attributes extends Record<string, any>>(
  filterFn?: InjectContentFilesFilterFunction<Attributes>
): ContentFile<Attributes>[] {
  const renderTaskService = inject(RenderTaskService);
  const task = renderTaskService.addRenderTask();
  const allContentFiles = inject(
    CONTENT_FILES_LIST_TOKEN
  ) as ContentFile<Attributes>[];

  if (filterFn) {
    const filteredContentFiles = allContentFiles.filter(filterFn);

    return filteredContentFiles;
  }

  renderTaskService.clearRenderTask(task);
  return allContentFiles;
}

export type InjectContentFilesFilterFunction<T extends Record<string, any>> = (
  value: ContentFile<T>,
  index: number,
  array: ContentFile<T>[]
) => boolean;
