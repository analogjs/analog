/// <reference types="vite/client" />

import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map, switchMap } from 'rxjs/operators';
import fm from 'front-matter';
import { Observable, of } from 'rxjs';

import { ContentFile } from './content-file';
import { CONTENT_FILES_TOKEN } from './content-files-token';
import { waitFor } from './utils/zone-wait-for';

/**
 * Retrieves the static content using the provided param
 *
 * @param param route parameter (default: 'slug')
 * @param fallback fallback text if content file is not found (default: 'No Content Found')
 */
export function injectContent<
  Attributes extends Record<string, any> = Record<string, any>
>(
  param = 'slug',
  fallback = 'No Content Found'
): Observable<ContentFile<Attributes | Record<string, never>>> {
  const route = inject(ActivatedRoute);
  const contentFiles = inject(CONTENT_FILES_TOKEN);
  return route.paramMap.pipe(
    map((params) => params.get(param)),
    switchMap((slug) => {
      const filename = `/src/content/${slug}.md`;
      const contentFile = contentFiles[filename];

      if (!contentFile) {
        return of({
          attributes: {},
          filename,
          content: fallback,
        });
      }

      return new Promise<string>((resolve) => {
        const contentResolver = contentFile();

        if (import.meta.env.SSR === true) {
          waitFor(contentResolver).then((content) => {
            resolve(content);
          });
        } else {
          contentResolver.then((content) => {
            resolve(content);
          });
        }
      }).then((content) => {
        const { body, attributes } = fm<Attributes | Record<string, never>>(
          content
        );

        return {
          filename,
          attributes,
          content: body,
        };
      });
    })
  );
}
