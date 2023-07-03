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
  const file = injectContentFiles<PostAttributes>().find((contentFile) => {
    return contentFile.slug === route.params['slug'];
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
