import { inject } from '@angular/core';
import { CONTENT_FILES_LIST_TOKEN, type ContentFile } from '@analogjs/content';

/**
 * Builds a `routeMeta.getPrerenderParams` function that prerenders one
 * page per content file: each file at the top level of `contentDir`
 * becomes a parameter set for the page's route.
 *
 * ```ts
 * // blog/[slug].page.ts
 * export const routeMeta: RouteMeta = {
 *   getPrerenderParams: fromContentDir('src/content/blog'),
 * };
 * ```
 *
 * The default mapping fills `slug` with the file's slug (front-matter
 * `slug` or the file basename), matching `injectContent`'s default
 * parameter; `transform` maps a file onto other parameters or skips it
 * with `false`. Unmatched parameters render per request via
 * `PrerenderFallback.Server`. The content list resolves from
 * `CONTENT_FILES_LIST_TOKEN`, so this runs wherever server routes are
 * extracted in an injection context.
 */
export function fromContentDir(
  contentDir: string,
  transform?: (file: ContentFile) => Record<string, string> | false,
): () => Record<string, string>[] {
  return () => {
    const contentFiles = inject(CONTENT_FILES_LIST_TOKEN);
    const dir = `/${contentDir.replace(/^\/+|\/+$/g, '')}/`;

    const params: Record<string, string>[] = [];
    for (const file of contentFiles) {
      const base = file.filename.startsWith(dir)
        ? file.filename.slice(dir.length)
        : undefined;
      if (!base || base.includes('/')) {
        continue;
      }

      const fileParams = transform
        ? transform(file)
        : { slug: decodeURI(file.slug) };
      if (fileParams) {
        params.push(fileParams);
      }
    }
    return params;
  };
}
