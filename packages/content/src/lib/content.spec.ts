import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { expect } from 'vitest';
import { Observable, of } from 'rxjs';

import { CONTENT_FILES_TOKEN } from './content-files-token';
import { injectContent } from './content';
import { ContentFile } from './content-file';

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
      expect(c.filename).toEqual('/src/content/test.md');
    });
    flushMicrotasks();
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
      expect(c.filename).toEqual('/src/content/test.md');
    });
    flushMicrotasks();
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
      expect(c.filename).toEqual('/src/content/test.md');
      expect(c.slug).toEqual('test');
    });
    flushMicrotasks();
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
      expect(c.filename).toEqual('/src/content/custom-slug-test.md');
      expect(c.slug).toEqual('custom-slug-test');
    });
    flushMicrotasks();
  }));

  function setup(
    args: Partial<{
      customParam: string;
      customFallback: string;
      routeParams: { [key: string]: any };
      contentFiles: Record<string, () => Promise<string>>;
    }>
  ) {
    TestBed.configureTestingModule({
      providers: [
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
