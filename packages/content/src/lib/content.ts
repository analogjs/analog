/// <reference types="vite/client" />

import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';

const CONTENT_FOLDER_FILES = import.meta.glob(['/src/content/**/*.md'], {
  as: 'raw',
  eager: true,
});

/**
 * Retrieves the static content using the provided param
 *
 * @param param route parameter (default: 'slug')
 * @param fallback fallback text if content file is not found (default: 'No Content Found')
 */
export function injectContent(param = 'slug', fallback = 'No Content Found') {
  const route = inject(ActivatedRoute);
  const content = route.paramMap.pipe(
    map((params) => params.get(param)),
    map((slug) => CONTENT_FOLDER_FILES[`/src/content/${slug}.md`] || fallback)
  );

  return content;
}
