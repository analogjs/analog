import { InjectionToken } from '@angular/core';
import { ContentFile } from './content-file';
import { getContentFilesList } from './get-content-files';

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

      return Object.keys(contentFiles).map((filename) => {
        const attributes = contentFiles[filename];
        const slug = attributes['slug'];

        return {
          filename,
          attributes,
          slug: encodeURI(slug) ?? getSlug(filename),
        };
      });
    },
  }
);
