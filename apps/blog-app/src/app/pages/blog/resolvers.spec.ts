import '@angular/compiler';
import type { ContentFile } from '@analogjs/content';

import { describe, expect, it } from 'vitest';

import type { PostAttributes } from './models';
import { resolvePostMeta, resolvePostTitle } from './resolvers';

describe('blog post resolvers', () => {
  it('resolves metadata from a slug-matched content file', () => {
    const contentFiles: ContentFile<PostAttributes>[] = [
      {
        filename:
          '/virtual-workspace/apps/blog-app/src/content/2022-12-31-my-second-post.md',
        slug: 'my-second-post',
        attributes: {
          title: 'My Second Post',
          slug: 'my-second-post',
          description: 'My Second Post Description',
          coverImage: 'https://example.com/cover.png',
        },
      },
    ];

    expect(resolvePostTitle(contentFiles, 'my-second-post')).toBe(
      'My Second Post',
    );
    expect(
      resolvePostMeta(contentFiles, 'my-second-post', 'https://analogjs.org'),
    ).toEqual([
      {
        name: 'description',
        content: 'My Second Post Description',
      },
      {
        name: 'author',
        content: 'Analog Team',
      },
      {
        property: 'og:title',
        content: 'My Second Post',
      },
      {
        property: 'og:description',
        content: 'My Second Post Description',
      },
      {
        property: 'og:image',
        content:
          'https://analogjs.org/api/v1/og-images/my-second-post?title=My%20Second%20Post',
      },
      {
        property: 'twitter:image',
        content:
          'https://analogjs.org/api/v1/og-images/my-second-post?title=My%20Second%20Post',
      },
    ]);
  });

  it('falls back cleanly when no content file matches the route slug', () => {
    const contentFiles: ContentFile<PostAttributes>[] = [];

    expect(resolvePostTitle(contentFiles, 'missing-post')).toBe(
      'Post not found',
    );
    expect(resolvePostMeta(contentFiles, 'missing-post')).toEqual([]);
  });
});
