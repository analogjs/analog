import { computed, inject, resource, Signal } from '@angular/core';
import {
  ContentFile,
  ContentRenderer,
  parseRawContentFile,
  injectContentFileLoader,
  CONTENT_LOCALE,
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
  locale?: string | null,
): Promise<ContentFile<Attributes | Record<string, never>>> {
  // Normalize file keys so both "/src/content/..." and "/<project>/src/content/..." resolve.
  // This mirrors normalization used elsewhere in the content pipeline.
  const normalizedFiles: Record<string, () => Promise<string>> = {};
  const stemToKey: Record<string, string> = {};
  for (const [key, resolver] of Object.entries(contentFiles)) {
    const normalizedKey = key
      // replace any prefix up to the content directory with /src/content
      // use a non-greedy match so nested paths containing "/content" are preserved
      .replace(/^(?:.*?)\/content(?=\/)/, '/src/content')
      // normalize duplicate slashes
      .replace(/\/{2,}/g, '/');
    normalizedFiles[normalizedKey] = resolver;
    // Index by bare filename stem so slug-only lookups work
    const stem = normalizedKey
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '');
    if (stem && !stemToKey[stem]) {
      stemToKey[stem] = normalizedKey;
    }
  }

  // Try direct file first, then directory index variants, then bare slug via stem
  const base = `/src/content/${slug}`.replace(/\/{2,}/g, '/');
  const candidates = [
    `${base}.md`,
    `${base}.agx`,
    `${base}/index.md`,
    `${base}/index.agx`,
  ];

  // Try locale-prefixed paths first, then fall back to unprefixed, then bare slug via stem
  const localeCandidates = locale
    ? candidates.map((c) =>
        c.replace('/src/content/', `/src/content/${locale}/`),
      )
    : [];
  const allCandidates = [...localeCandidates, ...candidates];
  const matchKey =
    allCandidates.find((k) => k in normalizedFiles) ?? stemToKey[slug];
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
  const contentRenderer = inject(ContentRenderer);
  const locale = inject(CONTENT_LOCALE, { optional: true });
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
          const file = await getContentFile<Attributes>(
            files!,
            param,
            fallback,
            locale,
          );
          if (typeof file.content === 'string') {
            const rendered = (await contentRenderer.render(file.content)) as {
              toc?: Array<{ id: string; level: number; text: string }>;
            };
            return {
              ...file,
              toc: rendered.toc ?? [],
            };
          }
          return {
            ...file,
            toc: [],
          };
        }

        return {
          filename: '',
          slug: '',
          attributes: {},
          content: fallback,
          toc: [],
        } as ContentFile<Attributes | Record<string, never>>;
      } else {
        const file = await getContentFile<Attributes>(
          files!,
          param.customFilename,
          fallback,
          locale,
        );
        if (typeof file.content === 'string') {
          const rendered = (await contentRenderer.render(file.content)) as {
            toc?: Array<{ id: string; level: number; text: string }>;
          };
          return {
            ...file,
            toc: rendered.toc ?? [],
          };
        }
        return {
          ...file,
          toc: [],
        };
      }
    },
  });
}
