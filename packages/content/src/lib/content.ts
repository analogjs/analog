/// <reference types="vite/client" />

import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

import { ContentFile } from './content-file';
import { CONTENT_FILES_TOKEN } from './content-files-token';
import { parseRawContentFile } from './parse-raw-content-file';
import { waitFor } from './utils/zone-wait-for';
import { RenderTaskService } from './render-task.service';

function getContentFile<
  Attributes extends Record<string, any> = Record<string, any>,
>(
  contentFiles: Record<string, () => Promise<string>>,
  prefix: string,
  slug: string,
  fallback: string,
  renderTaskService: RenderTaskService,
): Observable<ContentFile<Attributes | Record<string, never>>> {
  // Normalize file keys so both "/src/content/..." and "/<project>/src/content/..." resolve.
  const normalizedFiles: Record<string, () => Promise<string>> = {};
  for (const [key, resolver] of Object.entries(contentFiles)) {
    const normalizedKey = key
      .replace(/^(?:.*)\/content/, '/src/content')
      .replace(/\/{2,}/g, '/');
    normalizedFiles[normalizedKey] = resolver as () => Promise<string>;
  }

  const base = `/src/content/${prefix}${slug}`.replace(/\/{2,}/g, '/');
  const candidates = [
    `${base}.md`,
    `${base}.agx`,
    `${base}/index.md`,
    `${base}/index.agx`,
  ];

  const matchKey = candidates.find((k) => k in normalizedFiles);
  const contentFile = matchKey ? normalizedFiles[matchKey] : undefined;
  const resolvedBase = (matchKey || `${base}.md`).replace(/\.(md|agx)$/, '');

  if (!contentFile) {
    return of({
      filename: resolvedBase,
      attributes: {},
      slug: '',
      content: fallback,
    });
  }

  const contentTask = renderTaskService.addRenderTask();
  return new Observable<string | { default: any; metadata: any }>(
    (observer) => {
      const contentResolver = contentFile();

      if (import.meta.env.SSR === true) {
        waitFor(contentResolver).then((content) => {
          observer.next(content);
          observer.complete();

          setTimeout(() => renderTaskService.clearRenderTask(contentTask), 10);
        });
      } else {
        contentResolver.then((content) => {
          observer.next(content);
          observer.complete();
        });
      }
    },
  ).pipe(
    map((contentFile) => {
      if (typeof contentFile === 'string') {
        const { content, attributes } =
          parseRawContentFile<Attributes>(contentFile);

        return {
          filename: resolvedBase,
          slug,
          attributes,
          content,
        };
      }
      return {
        filename: resolvedBase,
        slug,
        attributes: contentFile.metadata,
        content: contentFile.default,
      };
    }),
  );
}

/**
 * Retrieves the static content using the provided param and/or prefix.
 *
 * @param param route parameter (default: 'slug')
 * @param fallback fallback text if content file is not found (default: 'No Content Found')
 */
export function injectContent<
  Attributes extends Record<string, any> = Record<string, any>,
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
  fallback = 'No Content Found',
): Observable<ContentFile<Attributes | Record<string, never>>> {
  const contentFiles = inject(CONTENT_FILES_TOKEN);
  const renderTaskService = inject(RenderTaskService);
  const task = renderTaskService.addRenderTask();

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
            fallback,
            renderTaskService,
          );
        }
        return of({
          filename: '',
          slug: '',
          attributes: {},
          content: fallback,
        });
      }),
      tap(() => renderTaskService.clearRenderTask(task)),
    );
  } else {
    return getContentFile<Attributes>(
      contentFiles,
      '',
      param.customFilename,
      fallback,
      renderTaskService,
    ).pipe(tap(() => renderTaskService.clearRenderTask(task)));
  }
}
