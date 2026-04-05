import { InjectionToken, Signal, inject, signal } from '@angular/core';

import { getContentFiles } from './get-content-files';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';

export const CONTENT_FILES_TOKEN: InjectionToken<
  Record<string, () => Promise<string>>
> = new InjectionToken<Record<string, () => Promise<string>>>(
  '@analogjs/content Content Files',
  {
    providedIn: 'root',
    factory() {
      const contentFiles = getContentFiles();
      const allFiles = { ...contentFiles };
      const contentFilesList = inject(CONTENT_FILES_LIST_TOKEN);

      const lookup: Record<string, string> = {};
      contentFilesList.forEach((item) => {
        const contentFilename = item.filename.replace(
          /(.*?)\/content/,
          '/src/content',
        );
        const fileParts = contentFilename.split('/');
        const filePath = fileParts.slice(0, fileParts.length - 1).join('/');
        const fileNameParts = fileParts[fileParts.length - 1].split('.');
        const ext = fileNameParts[fileNameParts.length - 1];
        let slug = (item.slug ?? '') as string;
        // Default empty slug to 'index'
        if (slug === '') {
          slug = 'index';
        }
        // If slug contains path separators, treat it as root-relative to /src/content
        const newBase = slug.includes('/')
          ? `/src/content/${slug}`
          : `${filePath}/${slug}`;
        lookup[contentFilename] = `${newBase}.${ext}`.replace(/\/{2,}/g, '/');
      });

      const objectUsingSlugAttribute: Record<string, () => Promise<string>> =
        {};
      Object.entries(allFiles).forEach((entry) => {
        const filename = entry[0];
        const value = entry[1];
        const strippedFilename = filename.replace(
          /^\/(.*?)\/content/,
          '/src/content',
        );

        const newFilename = lookup[strippedFilename];
        if (newFilename !== undefined) {
          const objectFilename = newFilename.replace(
            /^\/(.*?)\/content/,
            '/src/content',
          );
          objectUsingSlugAttribute[objectFilename] =
            value as () => Promise<string>;
        }
      });

      return objectUsingSlugAttribute;
    },
  },
);

export const CONTENT_FILES_MAP_TOKEN: InjectionToken<
  Signal<Record<string, () => Promise<string>>>
> = new InjectionToken<Signal<Record<string, () => Promise<string>>>>(
  '@analogjs/content Content Files',
  {
    providedIn: 'root',
    factory() {
      return signal(inject(CONTENT_FILES_TOKEN));
    },
  },
);
