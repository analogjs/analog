import { InjectionToken } from '@angular/core';

import { ContentFile } from './content-file';
import { getContentFilesList } from './get-content-files';

export const CONTENT_FILES_LIST_TOKEN = new InjectionToken<ContentFile[]>(
  '@analogjs/content Content Files List',
  {
    providedIn: 'root',
    factory() {
      const contentFiles = getContentFilesList();

      return Object.keys(contentFiles).map((filename) => {
        const attributes = contentFiles[filename];

        return {
          filename,
          attributes,
        };
      });
    },
  }
);
