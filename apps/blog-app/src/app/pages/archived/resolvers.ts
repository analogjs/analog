import { injectContentFiles } from '@analogjs/content';
import { MetaTag } from '@analogjs/router';
import { ActivatedRouteSnapshot, ResolveFn } from '@angular/router';
import { ArchivedPostAttributes } from './models';

// temporary
function injectActivePostAttributes(
  route: ActivatedRouteSnapshot,
): ArchivedPostAttributes {
  const file = injectContentFiles<ArchivedPostAttributes>().find(
    (contentFile) => {
      return (
        contentFile.filename ===
          `/src/content/archived/${route.params['slug']}.md` ||
        contentFile.slug === route.params['slug']
      );
    },
  );

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
