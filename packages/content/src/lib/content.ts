/// <reference types="vite/client" />

import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ContentFile } from './content-file';
import { CONTENT_FILES_TOKEN } from './content-files-token';
import { waitFor } from './utils/zone-wait-for';
import { parseRawContentFile } from './parse-raw-content-file';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';
import { CUSTOM_CONTENT_SLUG_TOKEN } from './custom-content-slug-token';

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
  const contentFilesList = inject(CONTENT_FILES_LIST_TOKEN);
  const prefix = typeof param === 'string' ? '' : `${param.subdirectory}/`;

  const paramKey = typeof param === 'string' ? param : param.param;
  const customSlugAttribute = inject(CUSTOM_CONTENT_SLUG_TOKEN);
  return route.paramMap.pipe(
    map((params) => params.get(paramKey)),
    switchMap((slug) => {
      // Get the file from the list of files based on the custom slug attribute, if it exists
      let fileFromList;
      let customFileSlug = '';
      if (customSlugAttribute) {
        fileFromList = contentFilesList.find((contentFile: ContentFile) => {
          return contentFile.attributes[customSlugAttribute] === slug;
        });
        customFileSlug = fileFromList
          ? fileFromList.attributes[customSlugAttribute]
          : '';
      }

      // If the file was not found in the list of files, use the slug as the filename
      const filenameSlug = fileFromList ? fileFromList.slug : slug;
      const filename = `/src/content/${prefix}${filenameSlug}.md`;

      const contentFile = contentFiles[filename];

      if (!contentFile) {
        return of({
          attributes: {},
          filename,
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

        // set the slug to the custom slug attribute if it exists, otherwise use the slug
        const slugToReturn = customFileSlug || slug || '';

        const returnObj = {
          filename,
          slug: slugToReturn,
          attributes,
          content,
        };

        return returnObj;
      });
    })
  );
}
