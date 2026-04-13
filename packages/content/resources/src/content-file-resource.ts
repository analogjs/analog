import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  computed,
  inject,
  resource,
  Signal,
  type ResourceRef,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import type { ContentFile } from '../../src/lib/content-file';
import {
  CONTENT_FILE_LOADER,
  injectContentFileLoader,
} from '../../src/lib/content-file-loader';
import { ContentRenderer } from '../../src/lib/content-renderer';
import { injectContentFilesMap } from '../../src/lib/inject-content-files';
import {
  FrontmatterValidationError,
  parseRawContentFile,
  parseRawContentFileAsync,
} from '../../src/lib/parse-raw-content-file';

export interface ContentFileResourceResult<
  Attributes extends Record<string, any> = Record<string, any>,
> extends ContentFile<Attributes | Record<string, never>> {
  toc: Array<{ id: string; level: number; text: string }>;
}

type ContentFileParams =
  | Signal<string | { customFilename: string }>
  | Signal<string>
  | Signal<{ customFilename: string }>;

async function validateAttributes<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  attributes: unknown,
  filename?: string,
) {
  const result = await schema['~standard'].validate(attributes);
  if (result.issues) {
    throw new FrontmatterValidationError(result.issues, filename);
  }

  return result.value;
}

function getValidationFilename(filename: string): string {
  return filename.replace(/^\/src\/content\//, '');
}

async function getContentFile<
  Attributes extends Record<string, any> = Record<string, any>,
>(
  contentFiles: Record<string, () => Promise<string>>,
  slug: string,
  fallback: string,
  schema?: StandardSchemaV1,
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
  const candidates = [`${base}.md`, `${base}/index.md`];

  const matchKey =
    candidates.find((k) => k in normalizedFiles) ?? stemToKey[slug];
  const contentFile = matchKey ? normalizedFiles[matchKey] : undefined;

  if (!contentFile) {
    return {
      filename: base,
      attributes: {},
      slug: '',
      content: fallback,
    } as ContentFile<Attributes | Record<string, never>>;
  }

  const resolvedBase = matchKey!.replace(/\.md$/, '');
  const validationFilename = getValidationFilename(matchKey!);

  return contentFile().then(
    async (contentFile: string | { default: any; metadata: any }) => {
      if (typeof contentFile === 'string') {
        const { content, attributes } = schema
          ? await parseRawContentFileAsync(
              contentFile,
              schema,
              validationFilename,
            )
          : parseRawContentFile<Attributes>(contentFile);

        return {
          filename: resolvedBase,
          slug,
          attributes,
          content,
        } as ContentFile<Attributes | Record<string, never>>;
      }

      const attributes = schema
        ? await validateAttributes(
            schema,
            contentFile.metadata,
            validationFilename,
          )
        : contentFile.metadata;

      return {
        filename: resolvedBase,
        slug,
        attributes,
        content: contentFile.default,
      } as ContentFile<Attributes | Record<string, never>>;
    },
  );
}

/**
 * Resource for requesting an individual content file.
 *
 * @example
 * ```typescript
 * // Without schema (existing behavior)
 * const post = contentFileResource<BlogAttributes>();
 *
 * // With schema validation
 * import * as v from 'valibot';
 * const BlogSchema = v.object({
 *   title: v.string(),
 *   date: v.pipe(v.string(), v.isoDate()),
 * });
 * const post = contentFileResource({ schema: BlogSchema });
 * ```
 */
export function contentFileResource<
  Attributes extends Record<string, any> = Record<string, any>,
>(
  params?: ContentFileParams,
  fallback?: string,
): ResourceRef<ContentFileResourceResult<Attributes> | undefined>;

export function contentFileResource<TSchema extends StandardSchemaV1>(options: {
  params?: ContentFileParams;
  fallback?: string;
  schema: TSchema;
}): ResourceRef<
  | ContentFileResourceResult<
      StandardSchemaV1.InferOutput<TSchema> & Record<string, any>
    >
  | undefined
>;

export function contentFileResource(
  paramsOrOptions?:
    | ContentFileParams
    | {
        params?: ContentFileParams;
        fallback?: string;
        schema?: StandardSchemaV1;
      },
  fallbackArg = 'No Content Found',
) {
  // Detect options-object form vs legacy positional form
  const isOptionsObject =
    paramsOrOptions &&
    typeof paramsOrOptions === 'object' &&
    !('set' in paramsOrOptions) && // not a Signal
    ('schema' in paramsOrOptions ||
      'params' in paramsOrOptions ||
      'fallback' in paramsOrOptions);

  const params: ContentFileParams | undefined = isOptionsObject
    ? (paramsOrOptions as { params?: ContentFileParams }).params
    : (paramsOrOptions as ContentFileParams | undefined);
  const fallback: string = isOptionsObject
    ? ((paramsOrOptions as { fallback?: string }).fallback ??
      'No Content Found')
    : fallbackArg;
  const schema: StandardSchemaV1 | undefined = isOptionsObject
    ? (paramsOrOptions as { schema?: StandardSchemaV1 }).schema
    : undefined;

  const contentRenderer = inject(ContentRenderer);
  const contentFilesMap = inject(CONTENT_FILE_LOADER, { optional: true })
    ? injectContentFileLoader()()
    : Promise.resolve(injectContentFilesMap());
  const input =
    params ||
    toSignal(
      inject(ActivatedRoute).paramMap.pipe(
        map((params) => params.get('slug') as string),
      ),
      { requireSync: true },
    );

  return resource({
    params: computed(() => input()),
    loader: async ({ params: resourceParams }) => {
      const param = resourceParams;
      const files = await contentFilesMap;

      if (typeof param === 'string') {
        if (param) {
          const file = await getContentFile(files!, param, fallback, schema);
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
        };
      } else {
        const file = await getContentFile(
          files!,
          param.customFilename,
          fallback,
          schema,
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
