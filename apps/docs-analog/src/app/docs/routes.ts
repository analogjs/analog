import type { LinkToInput } from '@analogjs/router';

export function docsLink(slug: string, locale: string | null = null) {
  const segments = slug.split('/').filter(Boolean);
  return (
    locale
      ? {
          path: '/[locale]/docs/[[...slug]]',
          params: { locale, slug: segments },
        }
      : { path: '/docs/[[...slug]]', params: { slug: segments } }
  ) satisfies LinkToInput;
}

export function localizeDocsLink(
  link: LinkToInput,
  locale: string | null,
): LinkToInput {
  if (
    locale &&
    typeof link === 'object' &&
    link?.path === '/docs/[[...slug]]'
  ) {
    return {
      ...link,
      path: '/[locale]/docs/[[...slug]]',
      params: { ...link.params, locale },
    };
  }
  return link;
}
