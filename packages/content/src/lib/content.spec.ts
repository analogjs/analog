import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { expect } from 'vitest';
import { injectContent } from './content';
import { of } from 'rxjs';
import { CONTENT_FILES_TOKEN } from './content-files-token';
import { ContentFile } from './content-file';

describe('injectContent', () => {
  it("should provide the fallback 'No Content Found' message when no match between slug and files and no custom fallback provided", fakeAsync(() => {
    const { injectContent } = setup({
      routeParams: { slug: 'test' },
    });
    let content;
    injectContent().subscribe((c) => {
      content = c;
    });
    flushMicrotasks();
    expect(content).toMatch('No Content Found');
  }));

  it("should provide the custom fallback 'Custom Fallback' message when no match between slug and files and custom fallback 'Custom Fallback' provided", fakeAsync(() => {
    const customFallback = 'Custom Fallback';
    const routeParams = { slug: 'test' };
    const { injectContent } = setup({ routeParams, customFallback });
    let content;
    injectContent().subscribe((c) => {
      content = c;
    });
    flushMicrotasks();
    expect(content).toMatch(customFallback);
  }));

  it('should provide the content of the file when match between slug and files', fakeAsync(() => {
    const routeParams = { slug: 'test' };
    const contentFiles = [
      {
        filename: '/src/content/dont-match.md',
        attributes: {},
        content: 'Dont Match',
      },
      {
        filename: '/src/content/test.md',
        attributes: {},
        content: 'Test Content',
      },
    ];
    const { injectContent } = setup({
      routeParams,
      contentFiles,
    });
    let content;
    injectContent().subscribe((c) => {
      content = c;
    });
    flushMicrotasks();
    expect(content).toMatch('Test Content');
  }));

  it('should provide the content of the file when match between custom param and files', fakeAsync(() => {
    const customParam = 'customSlug';
    const routeParams = { customSlug: 'custom-test' };
    const contentFiles = [
      {
        filename: '/src/content/dont-match.md',
        attributes: {},
        content: 'Dont Match',
      },
      {
        filename: '/src/content/custom-test.md',
        attributes: {},
        content: 'Test Content',
      },
    ];
    const { injectContent } = setup({
      customParam,
      routeParams,
      contentFiles,
    });
    let content;
    injectContent().subscribe((c) => {
      content = c;
    });
    flushMicrotasks();
    expect(content).toMatch('Test Content');
  }));

  function setup(
    args: Partial<{
      customParam: string;
      customFallback: string;
      routeParams: { [key: string]: any };
      contentFiles: ContentFile[];
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
      injectContent: () =>
        TestBed.runInInjectionContext(() =>
          injectContent(args.customParam, args.customFallback)
        ),
    };
  }
});
