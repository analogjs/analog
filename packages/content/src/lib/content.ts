/// <reference types="vite/client" />

import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ContentFile } from './content-file';
import { CONTENT_FILES_TOKEN } from './content-files-token';
import { parseRawContentFile } from './parse-raw-content-file';
import { waitFor } from './utils/zone-wait-for';

function getContentFile<
  Attributes extends Record<string, any> = Record<string, any>
>(
  contentFiles: Record<string, () => Promise<string>>,
  prefix: string,
  slug: string,
  fallback: string
): Observable<ContentFile<Attributes | Record<string, never>>> {
  const filePath = `/src/content/${prefix}${slug}.md`;
  const contentFile = contentFiles[filePath];
  if (!contentFile) {
    return of({
      filename: filePath,
      attributes: {},
      slug: '',
      content: fallback,
    });
  }

  return new Observable<string>((observer) => {
    const contentResolver = contentFile();

    if (import.meta.env.SSR === true) {
      waitFor(contentResolver).then((content) => {
        observer.next(content);
      });
    } else {
      contentResolver.then((content) => {
        observer.next(content);
      });
    }
  }).pipe(
    map((rawContentFile) => {
      const { content, attributes } =
        parseRawContentFile<Attributes>(rawContentFile);

      return {
        filename: filePath,
        slug,
        attributes,
        content,
      };
    })
  );
}

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
      }
    | {
        customFilename: string;
      } = 'slug',
  fallback = 'No Content Found'
): Observable<ContentFile<Attributes | Record<string, never>>> {
  const contentFiles = inject(CONTENT_FILES_TOKEN);

  if (typeof param === 'string' || 'param' in param) {
    const prefix = typeof param === 'string' ? '' : `${param.subdirectory}/`;
    const route = inject(ActivatedRoute);
    const paramKey = typeof param === 'string' ? param : param.param;
    return route.paramMap.pipe(
      map((params) => params.get(paramKey)),
      switchMap((slug) => {
        if (slug) {
          return getContentFile<Attributes>(
            contentFiles,
            prefix,
            slug,
            fallback
          );
        } else {
          return of({
            filename: '',
            slug: '',
            attributes: {},
            content: fallback,
          });
        }
      })
    );
  } else {
    return getContentFile<Attributes>(
      contentFiles,
      '',
      param.customFilename,
      fallback
    );
  }
}
