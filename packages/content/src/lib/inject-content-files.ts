import { ContentFile } from './content-file';
import { inject } from '@angular/core';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';

export function injectContentFiles<
  Attributes extends Record<string, any>
>(): ContentFile<Attributes>[] {
  return inject(CONTENT_FILES_LIST_TOKEN) as ContentFile<Attributes>[];
}
