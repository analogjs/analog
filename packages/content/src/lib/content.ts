/// <reference types="vite/client" />

import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';
import { injectContentFiles } from './inject-content-files';

/**
 * Retrieves the static content using the provided param
 *
 * @param param route parameter (default: 'slug')
 * @param fallback fallback text if content file is not found (default: 'No Content Found')
 */
export function injectContent(param = 'slug', fallback = 'No Content Found') {
  const route = inject(ActivatedRoute);
  const contentFiles = injectContentFiles();
  return route.paramMap.pipe(
    map((params) => params.get(param)),
    map((slug) => {
      return (
        contentFiles.find((file) => file.filename === `/src/content/${slug}.md`)
          ?.content || fallback
      );
    })
  );
}
