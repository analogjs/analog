import { InjectionToken, inject } from '@angular/core';

import { getContentFiles } from './get-content-files';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';

export const CONTENT_FILES_TOKEN = new InjectionToken<
  Record<string, () => Promise<string>>
>('@analogjs/content Content Files', {
  providedIn: 'root',
  factory() {
    const contentFiles = getContentFiles();
    const contentFilesList = inject(CONTENT_FILES_LIST_TOKEN);

    const lookup: Record<string, string> = {};
    contentFilesList.forEach((item) => {
      lookup[item.filename] = item.slug || item.filename;
    });

    const newObject: Record<string, () => Promise<string>> = {};
    Object.entries(contentFiles).forEach((entry) => {
      const filename = entry[0];
      const value = entry[1];

      const slug = lookup[filename];
      if (slug !== undefined) {
        newObject[slug] = value;
      }
    });

    return newObject;
  },
});
