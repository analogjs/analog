import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';
import { CONTENT_FILES_TOKEN } from './content-files-token';

const fileLoaders = {
  '/src/content/docs/erste-schritte/willkommen.md': () =>
    Promise.resolve('willkommen body'),
  '/src/content/docs/intro.md': () => Promise.resolve('intro body'),
  '/src/content/aliased-root.md': () => Promise.resolve('aliased body'),
};

vi.mock('./get-content-files', () => ({
  getContentFiles: () => fileLoaders,
  getContentFilesList: () => ({}),
}));

describe('CONTENT_FILES_TOKEN', () => {
  function setup(
    contentFilesList: { filename: string; slug: string; attributes: any }[],
  ) {
    TestBed.configureTestingModule({});
    TestBed.overrideProvider(CONTENT_FILES_LIST_TOKEN, {
      useValue: contentFilesList,
    });
    return TestBed.inject(CONTENT_FILES_TOKEN);
  }

  it('keys nested files under their own subdirectory when the slug includes a separator', () => {
    const map = setup([
      {
        filename: '/src/content/docs/erste-schritte/willkommen.md',
        slug: 'erste-schritte/willkommen',
        attributes: {},
      },
    ]);

    expect(map['/src/content/docs/erste-schritte/willkommen.md']).toBeDefined();
    expect(map['/src/content/erste-schritte/willkommen.md']).toBeUndefined();
  });

  it('still treats slash-containing slugs as root-relative when the file lives directly under /src/content', () => {
    const map = setup([
      {
        filename: '/src/content/aliased-root.md',
        slug: 'category/aliased',
        attributes: {},
      },
    ]);

    expect(map['/src/content/category/aliased.md']).toBeDefined();
  });

  it('preserves filename-derived slugs for nested files without a frontmatter slug', () => {
    const map = setup([
      {
        filename: '/src/content/docs/intro.md',
        slug: 'intro',
        attributes: {},
      },
    ]);

    expect(map['/src/content/docs/intro.md']).toBeDefined();
  });
});
