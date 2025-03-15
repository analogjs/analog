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
  const filePath = `/src/content/${slug}`;
  const contentFile =
    contentFiles[`${filePath}.md`] ?? contentFiles[`${filePath}.agx`];

  if (!contentFile) {
    return {
      filename: filePath,
      attributes: {},
      slug: '',
      content: fallback,
    } as ContentFile<Attributes | Record<string, never>>;
  }

  return contentFile().then(
    (contentFile: string | { default: any; metadata: any }) => {
      if (typeof contentFile === 'string') {
        const { content, attributes } =
          parseRawContentFile<Attributes>(contentFile);

        return {
          filename: filePath,
          slug,
          attributes,
          content,
        } as ContentFile<Attributes | Record<string, never>>;
      }

      return {
        filename: filePath,
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
