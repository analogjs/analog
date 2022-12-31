import { map } from 'rxjs';
import { inject, Type } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { RouteExport } from './models';

const CONTENT_FOLDER_FILES = import.meta.glob(['/src/content/**/*.md'], {
  as: 'raw',
  eager: true,
});

const CONTENT_FILES_GLOB = import.meta.glob(['/src/app/routes/**/*.md'], {
  as: 'raw',
  eager: true,
});

export const CONTENT_FILES: Record<
  string,
  () => Promise<{ default: Type<any> }>
> = Object.keys(CONTENT_FILES_GLOB).reduce((curr, key) => {
  curr = {
    ...curr,
    [key]: () => Promise.resolve(CONTENT_FILES_GLOB[key]),
  };

  return curr;
}, {});

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
