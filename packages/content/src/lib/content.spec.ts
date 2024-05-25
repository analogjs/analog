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

  it('should return ContentFile object with correct filename, correct attributes, and the correct content of the file when match between slug and files', fakeAsync(() => {
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
    injectContent().subscribe((c) => {
      expect(c.content).toMatch('Test Content');
      expect(c.attributes).toEqual({ slug: 'test' });
      expect(c.filename).toEqual('/src/content/test');
      expect(c.slug).toEqual('test');
    });
    flushMicrotasks();
    flush();
  }));

  it('should return ContentFile object with correct filename, correct attributes, and the correct content of the file when match between custom param and files', fakeAsync(() => {
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
    injectContent().subscribe((c) => {
      expect(c.content).toMatch('Test Content');
      expect(c.attributes).toEqual({ slug: 'custom-slug-test' });
      expect(c.filename).toEqual('/src/content/custom-slug-test');
      expect(c.slug).toEqual('custom-slug-test');
    });
    flushMicrotasks();
    flush();
  }));

  it('should return ContentFile object when a custom param with prefix is provided', fakeAsync(() => {
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
    injectContent().subscribe((c) => {
      expect(c.content).toMatch('Test Content');
      expect(c.attributes).toEqual({ slug: 'custom-prefix-slug-test' });
      expect(c.filename).toEqual(
        '/src/content/customPrefix/custom-prefix-slug-test'
      );
      expect(c.slug).toEqual('custom-prefix-slug-test');
    });
    flushMicrotasks();
    flush();
  }));

  it('should return ContentFile object when a custom filename is provided', fakeAsync(() => {
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
    injectContent().subscribe((c) => {
      expect(c.content).toMatch('Test Content');
      expect(c.attributes).toEqual({ slug: 'custom-filename-test-slug' });
      expect(c.filename).toEqual('/src/content/custom-filename-test');
      expect(c.slug).toEqual('custom-filename-test');
    });
    flushMicrotasks();
    flush();
  }));

  it('should return ContentFile object matching md file if both md and agx available', fakeAsync(() => {
    const routeParams = { slug: 'test' };
    const contentFiles = {
      '/src/content/test.md': () =>
        Promise.resolve(`---
slug: 'test'
---
Test md Content`),
      '/src/content/test.agx': () =>
        Promise.resolve(`---
slug: 'test'
---
Test agx Content`),
    };
    const { injectContent } = setup({
      routeParams,
      contentFiles,
    });
    injectContent().subscribe((c) => {
      expect(c.content).toMatch('Test md Content');
      expect(c.attributes).toEqual({ slug: 'test' });
      expect(c.filename).toEqual('/src/content/test');
      expect(c.slug).toEqual('test');
    });
    flushMicrotasks();
    flush();
  }));

  it('should return ContentFile object with data set to exports for non-string contentFiles', fakeAsync(() => {
    const routeParams = { slug: 'test' };
    const metadataExport = { title: 'test' };
    const defaultExport = 'default';
    const contentFiles = {
      '/src/content/test.agx': () =>
        Promise.resolve({
          default: defaultExport,
          metadata: metadataExport,
        }),
    };
    const { injectContent } = setup({
      routeParams,
      contentFiles,
    });
    injectContent().subscribe((c) => {
      expect(c.content).toMatch(defaultExport);
      expect(c.attributes).toEqual(metadataExport);
      expect(c.filename).toEqual('/src/content/test');
      expect(c.slug).toEqual('test');
    });
    flushMicrotasks();
    flush();
  }));

  it('should finish the stream when content is resolved', fakeAsync(() => {
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

    injectContent().subscribe({
      next: (c) => {
        content = c;
      },
      complete: () => {
        completed = true;
      },
    });

    flushMicrotasks();
    flush();

    expect(completed).toBe(true);
    expect(content).toEqual({
      content: 'Test Content',
      attributes: { slug: 'test' },
      filename: '/src/content/test',
      slug: 'test',
    });
  }));

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
    }>
  ) {
    TestBed.configureTestingModule({
      providers: [
        RenderTaskService,
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(
              convertToParamMap(args.routeParams ?? { slug: 'test' })
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
          injectContent<TestAttributes>(args.customParam, args.customFallback)
        ),
    };
  }
});
