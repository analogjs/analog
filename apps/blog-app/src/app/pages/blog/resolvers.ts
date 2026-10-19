import { injectContentFiles, type ContentFile } from '@analogjs/content';
import { MetaTag } from '@analogjs/router';
import { ResolveFn } from '@angular/router';

import { PostAttributes } from './models';

function normalizeContentFilename(filename: string): string {
  return filename
    .replace(/^(?:.*?)\/content(?=\/)/, '/src/content')
    .replace(/\/{2,}/g, '/');
}

function findActivePostAttributes(
  contentFiles: ContentFile<PostAttributes>[],
  slug: string | undefined,
): PostAttributes | undefined {
  if (!slug) {
    return undefined;
  }

  return contentFiles.find((contentFile) => {
    const normalizedFilename = normalizeContentFilename(contentFile.filename);
    const stem = normalizedFilename
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '');

    return (
      !normalizedFilename.includes('/archived/') &&
      (normalizedFilename === `/src/content/${slug}.md` ||
        normalizedFilename === `/src/content/${slug}/index.md` ||
        contentFile.slug === slug ||
        stem === slug)
    );
  })?.attributes;
}

export function resolvePostTitle(
  contentFiles: ContentFile<PostAttributes>[],
  slug: string | undefined,
): string {
  return (
    findActivePostAttributes(contentFiles, slug)?.title ?? 'Post not found'
  );
}

export function resolvePostMeta(
  contentFiles: ContentFile<PostAttributes>[],
  slug: string | undefined,
  base = import.meta.env['VITE_ANALOG_BASE_URL'] || 'http://localhost:43010',
): MetaTag[] {
  const postAttributes = findActivePostAttributes(contentFiles, slug);

  if (!postAttributes) {
    return [];
  }

  const title = encodeURIComponent(postAttributes.title);
  const imageUrl = `${base}/api/v1/og-images/${postAttributes.slug}?title=${title}`;

  return [
    {
      name: 'description',
      content: postAttributes.description,
    },
    {
      name: 'author',
      content: 'Analog Team',
    },
    {
      property: 'og:title',
      content: postAttributes.title,
    },
    {
      property: 'og:description',
      content: postAttributes.description,
    },
    {
      property: 'og:image',
      content: imageUrl,
    },
    {
      property: 'twitter:image',
      content: imageUrl,
    },
  ];
}

export const postTitleResolver: ResolveFn<string> = (route) =>
  resolvePostTitle(
    injectContentFiles<PostAttributes>(),
    route.params['slug'] as string | undefined,
  );

export const postMetaResolver: ResolveFn<MetaTag[]> = (route) =>
  resolvePostMeta(
    injectContentFiles<PostAttributes>(),
    route.params['slug'] as string | undefined,
  );
