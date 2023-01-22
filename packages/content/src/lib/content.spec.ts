import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { expect } from 'vitest';
import { injectContent } from './content';
import { Observable, of } from 'rxjs';
import { CONTENT_FILES_TOKEN } from './content-files-token';
import { ContentFile } from './content-file';

describe('injectContent', () => {
  type TestAttributes = {
    slug: string;
  };
  it("should return ContentFile object with empty filename, empty attributes, and default fallback 'No Content Found' as content when no match between slug and files and no custom fallback provided", fakeAsync(() => {
    const { injectContent } = setup({
      routeParams: { slug: 'test' },
    });
    injectContent().subscribe((c) => {
      expect(c.content).toMatch('No Content Found');
      expect(c.attributes).toEqual({});
      expect(c.filename).toEqual('');
    });
    flushMicrotasks();
  }));

  it("should return ContentFile object with empty filename, empty attributes, and the custom fallback 'Custom Fallback' as content when no match between slug and files and custom fallback 'Custom Fallback' provided", fakeAsync(() => {
    const customFallback = 'Custom Fallback';
    const routeParams = { slug: 'test' };
    const { injectContent } = setup({ routeParams, customFallback });
    injectContent().subscribe((c) => {
      expect(c.content).toMatch(customFallback);
      expect(c.attributes).toEqual({});
      expect(c.filename).toEqual('');
    });
    flushMicrotasks();
  }));

  it('should return ContentFile object with correct filename, correct attributes, and the correct content of the file when match between slug and files', fakeAsync(() => {
    const routeParams = { slug: 'test' };
    const contentFiles = [
      {
        filename: '/src/content/dont-match.md',
        attributes: {
          slug: 'dont-match',
        },
        content: 'Dont Match',
      },
      {
        filename: '/src/content/test.md',
        attributes: {
          slug: 'test',
        },
        content: 'Test Content',
      },
    ];
    const { injectContent } = setup({
      routeParams,
      contentFiles,
    });
    injectContent().subscribe((c) => {
      expect(c.content).toMatch('Test Content');
      expect(c.attributes).toEqual({ slug: 'test' });
      expect(c.filename).toEqual('/src/content/test.md');
    });
    flushMicrotasks();
  }));

  it('should return ContentFile object with correct filename, correct attributes, and the correct content of the file when match between custom param and files', fakeAsync(() => {
    const customParam = 'customSlug';
    const routeParams = { customSlug: 'custom-slug-test' };
    const contentFiles: ContentFile<TestAttributes>[] = [
      {
        filename: '/src/content/dont-match.md',
        attributes: {
          slug: 'dont-match',
        },
        content: 'Dont Match',
      },
      {
        filename: '/src/content/custom-slug-test.md',
        attributes: {
          slug: 'custom-slug-test',
        },
        content: 'Test Content',
      },
    ];
    const { injectContent } = setup({
      customParam,
      routeParams,
      contentFiles,
    });
    injectContent().subscribe((c) => {
      expect(c.content).toMatch('Test Content');
      expect(c.attributes).toEqual({ slug: 'custom-slug-test' });
      expect(c.filename).toEqual('/src/content/custom-slug-test.md');
    });
    flushMicrotasks();
  }));

  function setup(
    args: Partial<{
      customParam: string;
      customFallback: string;
      routeParams: { [key: string]: any };
      contentFiles: ContentFile<TestAttributes>[];
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
