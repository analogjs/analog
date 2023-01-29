import { InjectionToken } from '@angular/core';

import { getContentFiles } from './get-content-files';

export const CONTENT_FILES_TOKEN = new InjectionToken<
  Record<string, () => Promise<string>>
>('@analogjs/content Content Files', {
  providedIn: 'root',
  factory() {
    const contentFiles = getContentFiles();

    return contentFiles;
  },
});
