import {
  fakeAsync,
  flushMicrotasks,
  flush,
  TestBed,
} from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { expect } from 'vitest';
import { Observable, of } from 'rxjs';

import { CONTENT_FILES_TOKEN } from './content-files-token';
import { injectContent } from './content';
import { ContentFile } from './content-file';
import { ContentRenderer, NoopContentRenderer } from './content-renderer';
import { RenderTaskService } from './render-task.service';

describe('injectContent', () => {
  type TestAttributes = {
    slug: string;
  };
  it("should return ContentFile object with empty filename, empty attributes, and default fallback 'No Content Found' as content when no match between slug and files and no custom fallback provided", fakeAsync(() => {
    const { injectContent } = setup({
      routeParams: { slug: 'test' },
      contentFiles: {},
    });
    injectContent().subscribe((c) => {
      expect(c.content).toMatch('No Content Found');
      expect(c.attributes).toEqual({});
      expect(c.filename).toEqual('/src/content/test');
    });
    flushMicrotasks();
    flush();
  }));

  it("should return ContentFile object with empty filename, empty attributes, and the custom fallback 'Custom Fallback' as content when no match between slug and files and custom fallback 'Custom Fallback' provided", fakeAsync(() => {
    const customFallback = 'Custom Fallback';
    const routeParams = { slug: 'test' };
    const { injectContent } = setup({
      routeParams,
      customFallback,
      contentFiles: {},
    });
    injectContent().subscribe((c) => {
      expect(c.content).toMatch(customFallback);
      expect(c.attributes).toEqual({});
      expect(c.filename).toEqual('/src/content/test');
    });
    flushMicrotasks();
    flush();
  }));

  it('should return ContentFile object with correct filename, correct attributes, and the correct content of the file when match between slug and files', async () => {
    const routeParams = { slug: 'test' };
    const contentFiles = {
      '/src/content/dont-match.md': () =>
        Promise.resolve(`---
slug: 'dont-match'
---
Dont Match'`),
      '/src/content/test.md': () =>
        Promise.resolve(`---
slug: 'test'
---
Test Content`),
    };
    const { injectContent } = setup({
      routeParams,
      contentFiles,
    });

    const c = await new Promise<any>((resolve) => {
      injectContent().subscribe((val) => resolve(val));
    });
    expect(c.content).toMatch('Test Content');
    expect(c.attributes).toEqual({ slug: 'test' });
    expect(c.filename).toEqual('/src/content/test');
    expect(c.slug).toEqual('test');
    expect(c.toc).toEqual([]);
  });

  it('should return ContentFile object with correct filename, correct attributes, and the correct content of the file when match between custom param and files', async () => {
    const customParam = 'customSlug';
    const routeParams = { customSlug: 'custom-slug-test' };
    const contentFiles = {
      '/src/content/dont-match.md': () =>
        Promise.resolve(`---
slug: 'dont-match'
---
Dont Match'`),
      '/src/content/custom-slug-test.md': () =>
        Promise.resolve(`---
slug: 'custom-slug-test'
---
Test Content`),
    };
    const { injectContent } = setup({
      customParam,
      routeParams,
      contentFiles,
    });

    const c = await new Promise<any>((resolve) => {
      injectContent().subscribe((val) => resolve(val));
    });
    expect(c.content).toMatch('Test Content');
    expect(c.attributes).toEqual({ slug: 'custom-slug-test' });
    expect(c.filename).toEqual('/src/content/custom-slug-test');
    expect(c.slug).toEqual('custom-slug-test');
  });

  it('should return ContentFile object when a custom param with prefix is provided', async () => {
    const customParam = { subdirectory: 'customPrefix', param: 'slug' };
    const routeParams = { slug: 'custom-prefix-slug-test' };
    const contentFiles = {
      '/src/content/dont-match.md': () =>
        Promise.resolve(`---
slug: 'dont-match'
---
Dont Match'`),
      '/src/content/customPrefix/custom-prefix-slug-test.md': () =>
        Promise.resolve(`---
slug: 'custom-prefix-slug-test'
---
Test Content`),
    };
    const { injectContent } = setup({
      customParam,
      routeParams,
      contentFiles,
    });

    const c = await new Promise<any>((resolve) => {
      injectContent().subscribe((val) => resolve(val));
    });
    expect(c.content).toMatch('Test Content');
    expect(c.attributes).toEqual({ slug: 'custom-prefix-slug-test' });
    expect(c.filename).toEqual(
      '/src/content/customPrefix/custom-prefix-slug-test',
    );
    expect(c.slug).toEqual('custom-prefix-slug-test');
  });

  it('should return ContentFile object when a custom filename is provided', async () => {
    const customParam = { customFilename: 'custom-filename-test' };
    const routeParams = {};
    const contentFiles = {
      '/src/content/dont-match.md': () =>
        Promise.resolve(`---
slug: 'dont-match'
---
Dont Match'`),
      '/src/content/custom-filename-test.md': () =>
        Promise.resolve(`---
slug: 'custom-filename-test-slug'
---
Test Content`),
    };
    const { injectContent } = setup({
      customParam,
      routeParams,
      contentFiles,
    });

    const c = await new Promise<any>((resolve) => {
      injectContent().subscribe((val) => resolve(val));
    });
    expect(c.content).toMatch('Test Content');
    expect(c.attributes).toEqual({ slug: 'custom-filename-test-slug' });
    expect(c.filename).toEqual('/src/content/custom-filename-test');
    expect(c.slug).toEqual('custom-filename-test');
  });

  it('should finish the stream when content is resolved', async () => {
    const routeParams = {};
    const contentFiles = {
      '/src/content/test.md': () =>
        Promise.resolve(`---
slug: 'test'
---
Test Content`),
    };
    const { injectContent } = setup({
      routeParams,
      contentFiles,
      customParam: {
        customFilename: 'test',
      },
    });

    let completed = false;
    let content: ContentFile<TestAttributes | Record<string, never>> | null =
      null;

    await new Promise<void>((resolve, reject) => {
      injectContent().subscribe({
        next: (c) => {
          content = c;
        },
        error: reject,
        complete: () => {
          completed = true;
          resolve();
        },
      });
    });

    expect(completed).toBe(true);
    expect(content).toEqual({
      content: 'Test Content',
      attributes: { slug: 'test' },
      filename: '/src/content/test',
      slug: 'test',
      toc: [],
    });
  });

  it('should include toc entries when markdown headings are present', async () => {
    const routeParams = { slug: 'with-headings' };
    const contentFiles = {
      '/src/content/with-headings.md': () =>
        Promise.resolve(`---
slug: 'with-headings'
---
# Heading One
## Heading Two
Body content`),
    };
    const { injectContent } = setup({
      routeParams,
      contentFiles,
    });

    const c = await new Promise<any>((resolve) => {
      injectContent().subscribe((val) => resolve(val));
    });
    expect(c.content).toMatch('# Heading One');
    expect(c.toc).toEqual([
      { id: 'heading-one', level: 1, text: 'Heading One' },
      { id: 'heading-two', level: 2, text: 'Heading Two' },
    ]);
  });

  function setup(
    args: Partial<{
      customParam:
        | string
        | { subdirectory: string; param: string }
        | { customFilename: string };
      customFallback: string;
      routeParams: { [key: string]: any };
      contentFiles: Record<
        string,
        () => Promise<string | { default: any; metadata: any }>
      >;
    }>,
  ) {
    TestBed.configureTestingModule({
      providers: [
        RenderTaskService,
        {
          provide: ContentRenderer,
          useClass: NoopContentRenderer,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(
              convertToParamMap(args.routeParams ?? { slug: 'test' }),
            ),
          },
        },
      ],
    });
    TestBed.overrideProvider(CONTENT_FILES_TOKEN, {
      useValue: args.contentFiles ?? [],
    });
    return {
      injectContent: (): Observable<
        ContentFile<TestAttributes | Record<string, never>>
      > =>
        TestBed.runInInjectionContext(() =>
          injectContent<TestAttributes>(args.customParam, args.customFallback),
        ),
    };
  }
});
