import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';
import { CONTENT_LOCALE } from './content-locale';
import { ContentFile } from './content-file';
import {
  injectContentFiles,
  InjectContentFilesFilterFunction,
} from './inject-content-files';
import { RenderTaskService } from './render-task.service';

describe('injectContentFiles', () => {
  it('should provide empty files if no files provided', () => {
    const { injectContentFiles } = setup();
    const files = injectContentFiles();
    expect(files).toEqual([]);
  });
  it('should provide correctly parsed file if 1 file is provided with TestAttributes { testAttribute1: string, testAttribute2: number }', () => {
    type TestAttributes = { testAttribute1: string; testAttribute2: number };
    const contentFiles: ContentFile<TestAttributes>[] = [
      {
        filename: '/src/content/test.md',
        slug: 'test',
        attributes: {
          testAttribute1: 'hello world',
          testAttribute2: 2,
        },
        content: 'I am the content',
      },
    ];
    const { injectContentFiles } = setup<TestAttributes>(contentFiles);
    const injectedFiles = injectContentFiles();
    expect(injectedFiles).toEqual(contentFiles);
  });
  it('should filter the result based on the provided filter function', () => {
    type TestAttributes = { testAttribute1: string; testAttribute2: number };
    const contentFiles: ContentFile<TestAttributes>[] = [
      {
        filename: '/src/content/test.md',
        slug: 'test',
        attributes: {
          testAttribute1: 'hello world',
          testAttribute2: 2,
        },
        content: 'I am the content',
      },
      {
        filename: '/src/content/projects/test.md',
        slug: 'test-projects',
        attributes: {
          testAttribute1: 'hello world',
          testAttribute2: 2,
        },
        content: 'I am the project',
      },
      {
        filename: '/src/content/blog/test.md',
        slug: 'test-blog',
        attributes: {
          testAttribute1: 'hello world',
          testAttribute2: 2,
        },
        content: 'I am the blog post',
      },
    ];

    const contentFilterFn: InjectContentFilesFilterFunction<TestAttributes> = (
      contentFile,
    ) => !!contentFile.filename.includes('/src/content/blog/');
    const { injectContentFiles } = setup<TestAttributes>(
      contentFiles,
      contentFilterFn,
    );
    const injectedFiles = injectContentFiles();
    const expectedContentFiles = [contentFiles[2]];
    expect(injectedFiles).toEqual(expectedContentFiles);
  });

  function setup<Attributes extends Record<string, any>>(
    contentFiles: ContentFile[] = [],
    filterFn?: InjectContentFilesFilterFunction<Attributes>,
  ) {
    TestBed.configureTestingModule({
      providers: [RenderTaskService],
    });
    TestBed.overrideProvider(CONTENT_FILES_LIST_TOKEN, {
      useValue: contentFiles,
    });
    return {
      injectContentFiles: () =>
        TestBed.runInInjectionContext(() =>
          injectContentFiles<Attributes>(filterFn),
        ),
    };
  }
});

describe('injectContentFiles with locale', () => {
  const contentFiles: ContentFile[] = [
    {
      filename: '/src/content/en/blog/post-a.md',
      slug: 'post-a',
      attributes: {},
      content: 'English post A',
    },
    {
      filename: '/src/content/fr/blog/post-a.md',
      slug: 'post-a',
      attributes: {},
      content: 'French post A',
    },
    {
      filename: '/src/content/en/blog/post-b.md',
      slug: 'post-b',
      attributes: {},
      content: 'English post B',
    },
    {
      filename: '/src/content/blog/shared.md',
      slug: 'shared',
      attributes: {},
      content: 'Shared content (no locale)',
    },
  ];

  function setupWithLocale(locale: string) {
    TestBed.configureTestingModule({
      providers: [
        RenderTaskService,
        { provide: CONTENT_LOCALE, useValue: locale },
      ],
    });
    TestBed.overrideProvider(CONTENT_FILES_LIST_TOKEN, {
      useValue: contentFiles,
    });
    return {
      injectContentFiles: () =>
        TestBed.runInInjectionContext(() => injectContentFiles()),
    };
  }

  it('should return only files matching the locale subdirectory', () => {
    const { injectContentFiles } = setupWithLocale('en');
    const files = injectContentFiles();

    expect(files.map((f) => f.filename)).toEqual([
      '/src/content/en/blog/post-a.md',
      '/src/content/en/blog/post-b.md',
      '/src/content/blog/shared.md',
    ]);
  });

  it('should return french files when locale is fr', () => {
    const { injectContentFiles } = setupWithLocale('fr');
    const files = injectContentFiles();

    expect(files.map((f) => f.filename)).toEqual([
      '/src/content/fr/blog/post-a.md',
      '/src/content/blog/shared.md',
    ]);
  });

  it('should include universal content with no localized variant', () => {
    const { injectContentFiles } = setupWithLocale('en');
    const files = injectContentFiles();
    const filenames = files.map((f) => f.filename);

    expect(filenames).toContain('/src/content/blog/shared.md');
  });

  it('should support frontmatter locale attribute', () => {
    const filesWithAttr: ContentFile[] = [
      {
        filename: '/src/content/blog/post.md',
        slug: 'post',
        attributes: { locale: 'fr' },
        content: 'French via frontmatter',
      },
      {
        filename: '/src/content/blog/other.md',
        slug: 'other',
        attributes: { locale: 'en' },
        content: 'English via frontmatter',
      },
    ];

    TestBed.configureTestingModule({
      providers: [
        RenderTaskService,
        { provide: CONTENT_LOCALE, useValue: 'fr' },
      ],
    });
    TestBed.overrideProvider(CONTENT_FILES_LIST_TOKEN, {
      useValue: filesWithAttr,
    });

    const files = TestBed.runInInjectionContext(() => injectContentFiles());
    expect(files).toHaveLength(1);
    expect(files[0].attributes['locale']).toBe('fr');
  });
});
