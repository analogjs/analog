import {
  Injectable,
  InjectionToken,
  Signal,
  signal,
  type Provider,
} from '@angular/core';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { CONTENT_FILES_TOKEN } from '../../src/lib/content-files-token';
import {
  CONTENT_FILE_LOADER,
  withContentFileLoader,
} from '../../src/lib/content-file-loader';
import { contentFileResource } from './content-file-resource';
import { ContentRenderer } from '../../src/lib/content-renderer';

const TEST_RESOURCE_TOKEN = new InjectionToken<
  ReturnType<typeof contentFileResource>
>('TEST_RESOURCE_TOKEN');

@Injectable()
class TestContentRenderer extends ContentRenderer {
  override async render(content: string) {
    const toc = [...content.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)].map(
      (match) => ({
        id: match[2]
          .trim()
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-'),
        level: match[1].length,
        text: match[2].trim(),
      }),
    );
    return { content, toc };
  }
}

describe('contentFileResource', () => {
  it('includes toc entries for markdown content', async () => {
    const contentFiles = {
      '/src/content/test.md': () =>
        Promise.resolve(`---
slug: 'test'
---
# Heading One
## Heading Two
Body content`),
    };
    setup({ routeParams: { slug: 'test' }, contentFiles });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/test',
      slug: 'test',
      attributes: { slug: 'test' },
      content: '# Heading One\n## Heading Two\nBody content',
      toc: [
        { id: 'heading-one', level: 1, text: 'Heading One' },
        { id: 'heading-two', level: 2, text: 'Heading Two' },
      ],
    });
  });

  it('returns empty toc for module/object content', async () => {
    const contentFiles = {
      '/src/content/object-content.md': () =>
        Promise.resolve({
          default: '<h1>Heading</h1>',
          metadata: { slug: 'object-content' },
        }),
    };
    setup({ routeParams: { slug: 'object-content' }, contentFiles });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/object-content',
      slug: 'object-content',
      attributes: { slug: 'object-content' },
      content: '<h1>Heading</h1>',
      toc: [],
    });
  });

  it('returns fallback content with empty toc when file is missing', async () => {
    setup({
      routeParams: { slug: 'missing' },
      contentFiles: {},
    });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/missing',
      slug: '',
      attributes: {},
      content: 'No Content Found',
      toc: [],
    });
  });

  it('supports custom filename signal and includes toc', async () => {
    const contentFiles = {
      '/src/content/docs/index.md': () =>
        Promise.resolve(`---
slug: 'docs'
---
# Docs Heading`),
    };
    setup({
      routeParams: {},
      contentFiles,
      params: signal({ customFilename: 'docs' }),
    });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/docs/index',
      slug: 'docs',
      attributes: { slug: 'docs' },
      content: '# Docs Heading',
      toc: [{ id: 'docs-heading', level: 1, text: 'Docs Heading' }],
    });
  });

  it('finds a file by bare slug without path prefix', async () => {
    const contentFiles = {
      '/src/content/blog/my-post.md': () =>
        Promise.resolve(`---
slug: 'my-post'
---
# My Post`),
    };
    setup({
      routeParams: { slug: 'my-post' },
      contentFiles,
    });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/blog/my-post',
      slug: 'my-post',
      attributes: { slug: 'my-post' },
      content: '# My Post',
      toc: [{ id: 'my-post', level: 1, text: 'My Post' }],
    });
  });

  it('resolves nested paths that include a content segment name', async () => {
    const contentFiles = {
      '/src/content/docs/reference/api/nested/content.md': () =>
        Promise.resolve(`---
slug: 'docs/reference/api/nested/content'
---
# Nested Content`),
    };
    setup({
      routeParams: { slug: 'docs/reference/api/nested/content' },
      contentFiles,
    });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/docs/reference/api/nested/content',
      slug: 'docs/reference/api/nested/content',
      attributes: { slug: 'docs/reference/api/nested/content' },
      content: '# Nested Content',
      toc: [{ id: 'nested-content', level: 1, text: 'Nested Content' }],
    });
  });

  it('supports async schema validation', async () => {
    const contentFiles = {
      '/src/content/blog/post.md': () =>
        Promise.resolve(`---
title: Hello World
---
# Blog Post`),
    };
    const schema: StandardSchemaV1<unknown, { title: string; slug: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) => {
          const frontmatter = value as { title: string };
          return {
            value: {
              title: frontmatter.title,
              slug: 'hello-world',
            },
          };
        },
      },
    };

    setup({
      routeParams: { slug: 'blog/post' },
      contentFiles,
      schema,
    });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/blog/post',
      slug: 'blog/post',
      attributes: { title: 'Hello World', slug: 'hello-world' },
      content: '# Blog Post',
      toc: [{ id: 'blog-post', level: 1, text: 'Blog Post' }],
    });
  });

  it('uses the injected content file loader when provided', async () => {
    const contentFiles = {
      '/src/content/async/loader.md': () =>
        Promise.resolve(`---
slug: 'async/loader'
---
# Loaded Async`),
    };

    setup({
      routeParams: { slug: 'async/loader' },
      contentFiles: {},
      contentFileLoader: async () => contentFiles,
      provideContentFilesToken: false,
    });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/async/loader',
      slug: 'async/loader',
      attributes: { slug: 'async/loader' },
      content: '# Loaded Async',
      toc: [{ id: 'loaded-async', level: 1, text: 'Loaded Async' }],
    });
  });

  it('supports the default content file loader provider', async () => {
    const contentFiles = {
      '/src/content/default-loader.md': () =>
        Promise.resolve(`---
slug: 'default-loader'
---
# Default Loader`),
    };

    setup({
      routeParams: { slug: 'default-loader' },
      contentFiles,
      providers: [withContentFileLoader()],
    });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/default-loader',
      slug: 'default-loader',
      attributes: { slug: 'default-loader' },
      content: '# Default Loader',
      toc: [{ id: 'default-loader', level: 1, text: 'Default Loader' }],
    });
  });

  it('validates module metadata when a schema is provided', async () => {
    const contentFiles = {
      '/src/content/guides/intro.md': () =>
        Promise.resolve({
          default: '<h1>Intro</h1>',
          metadata: { title: 'Intro' },
        }),
    };
    const schema: StandardSchemaV1<unknown, { title: string; slug: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) => {
          const frontmatter = value as { title: string };
          return {
            value: {
              title: frontmatter.title,
              slug: 'intro',
            },
          };
        },
      },
    };

    setup({
      routeParams: { slug: 'guides/intro' },
      contentFiles,
      schema,
    });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);
    await settleResource(result);

    expect(result.value()).toEqual({
      filename: '/src/content/guides/intro',
      slug: 'guides/intro',
      attributes: { title: 'Intro', slug: 'intro' },
      content: '<h1>Intro</h1>',
      toc: [],
    });
  });

  it('throws FrontmatterValidationError for invalid module metadata', async () => {
    const contentFiles = {
      '/src/content/guides/intro.md': () =>
        Promise.resolve({
          default: '<h1>Intro</h1>',
          metadata: {},
        }),
    };
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async () => ({
          issues: [{ message: 'Title is required', path: ['title'] }],
        }),
      },
    };

    setup({
      routeParams: { slug: 'guides/intro' },
      contentFiles,
      schema,
    });

    const result = TestBed.inject(TEST_RESOURCE_TOKEN);

    await expect(settleResource(result)).rejects.toThrow(
      '"guides/intro.md" frontmatter validation failed',
    );
  });
});

function setup(args: {
  routeParams: Record<string, any>;
  contentFiles: Record<
    string,
    () => Promise<string | { default: any; metadata: any }>
  >;
  contentFileLoader?: () => Promise<
    Record<string, () => Promise<string | { default: any; metadata: any }>>
  >;
  params?: Signal<string | { customFilename: string }>;
  provideContentFilesToken?: boolean;
  providers?: Provider[];
  schema?: StandardSchemaV1;
}) {
  const providers = [
    {
      provide: ActivatedRoute,
      useValue: {
        paramMap: of(convertToParamMap(args.routeParams)),
      },
    },
    {
      provide: ContentRenderer,
      useClass: TestContentRenderer,
    },
    ...(args.provideContentFilesToken === false
      ? []
      : [
          {
            provide: CONTENT_FILES_TOKEN,
            useValue: args.contentFiles as Record<
              string,
              () => Promise<string>
            >,
          },
        ]),
    ...(args.contentFileLoader
      ? [
          {
            provide: CONTENT_FILE_LOADER,
            useValue: args.contentFileLoader,
          },
        ]
      : []),
    ...(args.providers ?? []),
    {
      provide: TEST_RESOURCE_TOKEN,
      useFactory: () =>
        args.schema
          ? contentFileResource({ params: args.params, schema: args.schema })
          : contentFileResource(args.params),
    },
  ];

  TestBed.configureTestingModule({
    providers,
  });
}

async function settleResource(result: { value: () => unknown }) {
  const appRef = TestBed.inject(ApplicationRef);
  // Prime reads and wait for the app to stabilize to let resource loaders complete.
  result.value();
  await appRef.whenStable();
  result.value();
  await appRef.whenStable();
}
