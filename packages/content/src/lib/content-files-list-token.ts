import { InjectionToken, inject } from '@angular/core';

import { ContentFile } from './content-file';
import { getContentFilesList } from './get-content-files';
import { CUSTOM_CONTENT_SLUG_TOKEN } from './custom-content-slug-token';

function getSlug(filename: string) {
  const parts = filename.match(/^(\\|\/)(.+(\\|\/))*(.+)\.(.+)$/);
  return parts?.length ? parts[4] : '';
}

export const CONTENT_FILES_LIST_TOKEN = new InjectionToken<ContentFile[]>(
  '@analogjs/content Content Files List',
  {
    providedIn: 'root',
    factory() {
      const contentFiles = getContentFilesList();
      const customSlugAttribute = inject(CUSTOM_CONTENT_SLUG_TOKEN);

      return Object.keys(contentFiles).map((filename) => {
        const attributes = contentFiles[filename];
        let slug = customSlugAttribute
          ? attributes[customSlugAttribute]
          : getSlug(filename);

        return {
          filename,
          attributes,
          slug: encodeURI(slug),
        };
      });
    },
  }
);
