import { injectContentFiles } from '@analogjs/content';
import { MetaTag } from '@analogjs/router';
import { ActivatedRouteSnapshot, ResolveFn } from '@angular/router';

import { PostAttributes } from './models';

// temporary
function injectActivePostAttributes(
  route: ActivatedRouteSnapshot,
): PostAttributes {
  const slug = route.params['slug'];
  const contentFiles = injectContentFiles<PostAttributes>();

  // Debug logging
  console.log('Looking for slug:', slug);
  console.log(
    'Available files:',
    contentFiles.map((f) => ({
      filename: f.filename,
      slug: f.slug,
    })),
  );

  const file = contentFiles.find((contentFile) => {
    return (
      contentFile.filename === `/src/content/${slug}.md` ||
      contentFile.slug === slug
    );
  });

  if (!file) {
    throw new Error(`Post not found for slug: ${slug}`);
  }

  return file.attributes;
}

export const postTitleResolver: ResolveFn<string> = (route) =>
  injectActivePostAttributes(route).title;

export const postMetaResolver: ResolveFn<MetaTag[]> = (route) => {
  const postAttributes = injectActivePostAttributes(route);
  const base =
    import.meta.env['VITE_ANALOG_BASE_URL'] || 'http://localhost:3000';
  const title = encodeURIComponent(postAttributes.title);
  const slug = postAttributes.slug;
  const imageUrl = `${base}/api/v1/og-images/${slug}?title=${title}`;

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
};
