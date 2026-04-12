import '@angular/compiler';
import type { ContentFile } from '@analogjs/content';

import { describe, expect, it } from 'vitest';

import type { ArchivedPostAttributes } from './models';
import { resolveArchivedPostMeta, resolveArchivedPostTitle } from './resolvers';

describe('archived post resolvers', () => {
  it('resolves metadata from an archived content file', () => {
    const contentFiles: ContentFile<ArchivedPostAttributes>[] = [
      {
        filename:
          '/virtual-workspace/apps/blog-app/src/content/archived/2022-01-08-post1-2024.md',
        slug: 'post1-2024',
        attributes: {
          title: 'My First Archived Blog Post',
          slug: 'post1-2024',
          description: 'My First Archived Blog Post Description',
          coverImage: 'https://example.com/archived-cover.png',
        },
      },
    ];

    expect(resolveArchivedPostTitle(contentFiles, 'post1-2024')).toBe(
      'My First Archived Blog Post',
    );
    expect(resolveArchivedPostMeta(contentFiles, 'post1-2024')).toEqual([
      {
        name: 'description',
        content: 'My First Archived Blog Post Description',
      },
      {
        name: 'author',
        content: 'Analog Team',
      },
      {
        property: 'og:title',
        content: 'My First Archived Blog Post',
      },
      {
        property: 'og:description',
        content: 'My First Archived Blog Post Description',
      },
      {
        property: 'og:image',
        content: 'https://example.com/archived-cover.png',
      },
    ]);
  });

  it('falls back cleanly when no archived content file matches the route slug', () => {
    const contentFiles: ContentFile<ArchivedPostAttributes>[] = [];

    expect(resolveArchivedPostTitle(contentFiles, 'missing-post')).toBe(
      'Archived post not found',
    );
    expect(resolveArchivedPostMeta(contentFiles, 'missing-post')).toEqual([]);
  });
});
