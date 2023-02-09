import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';
import { ContentFile } from './content-file';
import { injectContentFiles } from './inject-content-files';

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

  function setup<Attributes extends Record<string, any>>(
    contentFiles: ContentFile[] = []
  ) {
    TestBed.overrideProvider(CONTENT_FILES_LIST_TOKEN, {
      useValue: contentFiles,
    });
    return {
      injectContentFiles: () =>
        TestBed.runInInjectionContext(() => injectContentFiles<Attributes>()),
    };
  }
});
