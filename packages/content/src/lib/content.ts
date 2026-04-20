/// <reference types="vite/client" />

import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { from, Observable, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

import { ContentFile } from './content-file';
import { ContentRenderer } from './content-renderer';
import { CONTENT_LOCALE, withLocaleCandidates } from './content-locale';
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
  contentRenderer: ContentRenderer,
  locale?: string | null,
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
  const candidates = [`${base}.md`, `${base}/index.md`];

  const allCandidates = withLocaleCandidates(candidates, locale);
  const matchKey = allCandidates.find((k) => k in normalizedFiles);
  const contentFile = matchKey ? normalizedFiles[matchKey] : undefined;
  const resolvedBase = (matchKey || `${base}.md`).replace(/\.md$/, '');

  if (!contentFile) {
    return of({
      filename: resolvedBase,
      attributes: {},
      slug: '',
      content: fallback,
      toc: [],
    });
  }

  const contentTask = renderTaskService.addRenderTask();
  return new Observable<string | { default: string; metadata: Attributes }>(
    (observer) => {
      // `waitFor` is a no-op in non-Zone environments (browser without zone.js),
      // so this branch works for both SSR and client. Keeping a single path also
      // avoids Rolldown evaluating `import.meta.env.SSR` at library-build time
      // and eliminating the task-clearing branch, which caused SSR to hang once
      // the content map resolved a real lazy import.
      waitFor(contentFile()).then((content) => {
        observer.next(content);
        observer.complete();

        setTimeout(() => renderTaskService.clearRenderTask(contentTask), 10);
      });
    },
  ).pipe(
    switchMap((contentFile) => {
      if (typeof contentFile === 'string') {
        const { content, attributes } =
          parseRawContentFile<Attributes>(contentFile);
        return from(contentRenderer.render(content)).pipe(
          map((rendered) => ({
            filename: resolvedBase,
            slug,
            attributes,
            content,
            toc: rendered.toc ?? [],
          })),
        );
      }
      return of({
        filename: resolvedBase,
        slug,
        attributes: contentFile.metadata,
        content: contentFile.default,
        toc: [],
      });
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
  const contentRenderer = inject(ContentRenderer);
  const renderTaskService = inject(RenderTaskService);
  const locale = inject(CONTENT_LOCALE, { optional: true });
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
            contentRenderer,
            locale,
          );
        }
        return of({
          filename: '',
          slug: '',
          attributes: {},
          content: fallback,
          toc: [],
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
      contentRenderer,
      locale,
    ).pipe(tap(() => renderTaskService.clearRenderTask(task)));
  }
}
