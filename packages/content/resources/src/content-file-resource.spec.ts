import { Injectable, InjectionToken, Signal, signal } from '@angular/core';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { CONTENT_FILE_LOADER, ContentRenderer } from '@analogjs/content';
import { of } from 'rxjs';
import { expect } from 'vitest';

import { contentFileResource } from './content-file-resource';

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
      '/src/content/object-content.agx': () =>
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
});

function setup(args: {
  routeParams: Record<string, any>;
  contentFiles: Record<
    string,
    () => Promise<string | { default: any; metadata: any }>
  >;
  params?: Signal<string | { customFilename: string }>;
}) {
  TestBed.configureTestingModule({
    providers: [
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
      {
        provide: CONTENT_FILE_LOADER,
        useValue: async () =>
          args.contentFiles as Record<string, () => Promise<string>>,
      },
      {
        provide: TEST_RESOURCE_TOKEN,
        useFactory: () => contentFileResource(args.params),
      },
    ],
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
