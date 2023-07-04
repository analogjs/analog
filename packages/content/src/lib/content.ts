/// <reference types="vite/client" />

import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ContentFile } from './content-file';
import { CONTENT_FILES_TOKEN } from './content-files-token';
import { parseRawContentFile } from './parse-raw-content-file';
import { waitFor } from './utils/zone-wait-for';

/**
 * Retrieves the static content using the provided param and/or prefix.
 *
 * @param param route parameter (default: 'slug')
 * @param fallback fallback text if content file is not found (default: 'No Content Found')
 */
export function injectContent<
  Attributes extends Record<string, any> = Record<string, any>
>(
  param:
    | string
    | {
        param: string;
        subdirectory: string;
      } = 'slug',
  fallback = 'No Content Found'
): Observable<ContentFile<Attributes | Record<string, never>>> {
  const route = inject(ActivatedRoute);
  const contentFiles = inject(CONTENT_FILES_TOKEN);

  const paramKey = typeof param === 'string' ? param : param.param;
  return route.paramMap.pipe(
    map((params) => params.get(paramKey)),
    switchMap((slug) => {
      // Get the file from the list of files based on the custom slug attribute, if it exists
      const contentFile = contentFiles[slug || ''];

      if (!contentFile) {
        return of({
          attributes: {},
          filename: slug || '',
          slug: slug || '',
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
      }).then((rawContentFile) => {
        const { content, attributes } =
          parseRawContentFile<Attributes>(rawContentFile);

        const returnObj = {
          filename: slug || '',
          slug: slug || '',
          attributes,
          content,
        };

        return returnObj;
      });
    })
  );
}
