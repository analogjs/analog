import { injectContentFiles, type ContentFile } from '@analogjs/content';
import { MetaTag } from '@analogjs/router';
import { ResolveFn } from '@angular/router';
import { ArchivedPostAttributes } from './models';

function normalizeContentFilename(filename: string): string {
  return filename
    .replace(/^(?:.*?)\/content(?=\/)/, '/src/content')
    .replace(/\/{2,}/g, '/');
}

function findActivePostAttributes(
  contentFiles: ContentFile<ArchivedPostAttributes>[],
  slug: string | undefined,
): ArchivedPostAttributes | undefined {
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
      normalizedFilename.startsWith('/src/content/archived/') &&
      (normalizedFilename === `/src/content/archived/${slug}.md` ||
        normalizedFilename === `/src/content/archived/${slug}/index.md` ||
        contentFile.slug === slug ||
        stem === slug)
    );
  })?.attributes;
}

export function resolveArchivedPostTitle(
  contentFiles: ContentFile<ArchivedPostAttributes>[],
  slug: string | undefined,
): string {
  return (
    findActivePostAttributes(contentFiles, slug)?.title ??
    'Archived post not found'
  );
}

export function resolveArchivedPostMeta(
  contentFiles: ContentFile<ArchivedPostAttributes>[],
  slug: string | undefined,
): MetaTag[] {
  const postAttributes = findActivePostAttributes(contentFiles, slug);

  if (!postAttributes) {
    return [];
  }

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
      content: postAttributes.coverImage,
    },
  ];
}

export const postTitleResolver: ResolveFn<string> = (route) =>
  resolveArchivedPostTitle(
    injectContentFiles<ArchivedPostAttributes>(),
    route.params['slug'] as string | undefined,
  );

export const postMetaResolver: ResolveFn<MetaTag[]> = (route) =>
  resolveArchivedPostMeta(
    injectContentFiles<ArchivedPostAttributes>(),
    route.params['slug'] as string | undefined,
  );
