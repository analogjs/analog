import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveFn } from '@angular/router';
import { MetaTag } from '@analogjs/router';
import {
  CUSTOM_CONTENT_SLUG_TOKEN,
  injectContentFiles,
} from '@analogjs/content';
import { PostAttributes } from './models';

// temporary
function injectActivePostAttributes(
  route: ActivatedRouteSnapshot
): PostAttributes {
  const customSlugAttribute: string = inject(CUSTOM_CONTENT_SLUG_TOKEN);
  const file = injectContentFiles<PostAttributes>().find((contentFile) => {
    return customSlugAttribute
      ? contentFile.attributes[customSlugAttribute as keyof PostAttributes] ===
          route.params['slug']
      : contentFile.filename === `/src/content/${route.params['slug']}.md`;
  });

  return file!.attributes;
}

export const postTitleResolver: ResolveFn<string> = (route) =>
  injectActivePostAttributes(route).title;

export const postMetaResolver: ResolveFn<MetaTag[]> = (route) => {
  const postAttributes = injectActivePostAttributes(route);

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
};
