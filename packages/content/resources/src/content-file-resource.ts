import { computed, inject, resource, Signal } from '@angular/core';
import {
  ContentFile,
  parseRawContentFile,
  injectContentFileLoader,
} from '@analogjs/content';
import { ActivatedRoute } from '@angular/router';

import { toSignal } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';

type ContentFileParams = Signal<
  | string
  | {
      customFilename: string;
    }
>;

async function getContentFile<
  Attributes extends Record<string, any> = Record<string, any>,
>(
  contentFiles: Record<string, () => Promise<string>>,
  slug: string,
  fallback: string,
): Promise<ContentFile<Attributes | Record<string, never>>> {
  // Normalize file keys so both "/src/content/..." and "/<project>/src/content/..." resolve.
  // This mirrors normalization used elsewhere in the content pipeline.
  const normalizedFiles: Record<string, () => Promise<string>> = {};
  for (const [key, resolver] of Object.entries(contentFiles)) {
    const normalizedKey = key
      // replace any prefix up to /content with /src/content
      .replace(/^(?:.*)\/content/, '/src/content')
      // normalize duplicate slashes
      .replace(/\/{2,}/g, '/');
    normalizedFiles[normalizedKey] = resolver;
  }

  // Try direct file first, then directory index variants
  const base = `/src/content/${slug}`.replace(/\/{2,}/g, '/');
  const candidates = [
    `${base}.md`,
    `${base}.agx`,
    `${base}/index.md`,
    `${base}/index.agx`,
  ];

  const matchKey = candidates.find((k) => k in normalizedFiles);
  const contentFile = matchKey ? normalizedFiles[matchKey] : undefined;

  if (!contentFile) {
    return {
      filename: base,
      attributes: {},
      slug: '',
      content: fallback,
    } as ContentFile<Attributes | Record<string, never>>;
  }

  const resolvedBase = matchKey!.replace(/\.(md|agx)$/, '');

  return contentFile().then(
    (contentFile: string | { default: any; metadata: any }) => {
      if (typeof contentFile === 'string') {
        const { content, attributes } =
          parseRawContentFile<Attributes>(contentFile);

        return {
          filename: resolvedBase,
          slug,
          attributes,
          content,
        } as ContentFile<Attributes | Record<string, never>>;
      }

      return {
        filename: resolvedBase,
        slug,
        attributes: contentFile.metadata,
        content: contentFile.default,
      } as ContentFile<Attributes | Record<string, never>>;
    },
  );
}

/**
 * Resource for requesting an individual content file
 *
 * @param params
 * @param fallback
 * @returns
 */
export function contentFileResource<
  Attributes extends Record<string, any> = Record<string, any>,
>(params?: ContentFileParams, fallback = 'No Content Found') {
  const loaderPromise = injectContentFileLoader();
  const contentFilesMap = toSignal(from(loaderPromise()));
  const input =
    params ||
    toSignal(
      inject(ActivatedRoute).paramMap.pipe(
        map((params) => params.get('slug') as string),
      ),
      { requireSync: true },
    );

  return resource({
    params: computed(() => ({ input: input(), files: contentFilesMap() })),
    loader: async ({ params }) => {
      const { input: param, files } = params;

      if (typeof param === 'string') {
        if (param) {
          return getContentFile<Attributes>(files!, param, fallback);
        }

        return {
          filename: '',
          slug: '',
          attributes: {},
          content: fallback,
        } as ContentFile<Attributes | Record<string, never>>;
      } else {
        return getContentFile<Attributes>(
          files!,
          param.customFilename,
          fallback,
        );
      }
    },
  });
}
