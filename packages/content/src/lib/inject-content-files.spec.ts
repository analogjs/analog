import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';
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
