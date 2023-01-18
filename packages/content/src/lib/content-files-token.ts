import { InjectionToken } from '@angular/core';
import fm from 'front-matter';
import { ContentFile } from './content-file';
import { getRawFiles } from './get-raw-files';

export const CONTENT_FILES_TOKEN = new InjectionToken<ContentFile[]>(
  '@analogjs/content Content Files',
  {
    providedIn: 'root',
    factory() {
      const rawContentFiles = getRawFiles();

      return Object.keys(rawContentFiles).map((filename) => {
        const { body, attributes } = fm<Record<string, any>>(
          rawContentFiles[filename]
        );

        return {
          filename,
          content: body,
          attributes,
        };
      });
    },
  }
);
