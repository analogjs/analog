import { InjectionToken, inject } from '@angular/core';

import { getAgxFiles, getContentFiles } from './get-content-files';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';

export const CONTENT_FILES_TOKEN = new InjectionToken<
  Record<string, () => Promise<string>>
>('@analogjs/content Content Files', {
  providedIn: 'root',
  factory() {
    const contentFiles = getContentFiles();
    const agxFiles = getAgxFiles();
    const allFiles = { ...contentFiles, ...agxFiles };
    const contentFilesList = inject(CONTENT_FILES_LIST_TOKEN);

    const lookup: Record<string, string> = {};
    for (const item of contentFilesList) {
      const fileParts = item.filename.split('/');
      const filePath = fileParts.slice(0, fileParts.length - 1).join('/');
      const fileNameParts = fileParts[fileParts.length - 1].split('.');
      lookup[item.filename] = `${filePath}/${item.slug}.${
        fileNameParts[fileNameParts.length - 1]
      }`;
    }

    const objectUsingSlugAttribute: Record<string, () => Promise<string>> = {};
    for (const [filename, value] of Object.entries(allFiles)) {
      const newFilename = lookup[filename];
      if (newFilename !== undefined) {
        const objectFilename = newFilename.replace(
          /^\/(.*?)\/content/,
          '/src/content',
        );
        objectUsingSlugAttribute[objectFilename] =
          value as () => Promise<string>;
      }
    }

    return objectUsingSlugAttribute;
  },
});
