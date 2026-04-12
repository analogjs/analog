import { inject, resource } from '@angular/core';
import {
  injectContentListLoader,
  InjectContentFilesFilterFunction,
  ContentFile,
  CONTENT_LOCALE,
} from '@analogjs/content';

export function contentFilesResource<Attributes extends Record<string, any>>(
  filterFn?: InjectContentFilesFilterFunction<Attributes> | undefined,
) {
  const contentListLoader = injectContentListLoader<Attributes>();
  const locale = inject(CONTENT_LOCALE, { optional: true });
  const contentList = contentListLoader().then((items) => {
    let results = locale ? filterContentByLocale(items, locale) : items;
    if (filterFn) {
      results = results.filter(filterFn);
    }
    return results;
  });

  return resource({
    loader: () => contentList,
  });
}

function filterContentByLocale<T extends Record<string, any>>(
  files: ContentFile<T>[],
  locale: string,
): ContentFile<T>[] {
  const localePrefix = `/content/${locale}/`;

  const allLocalePrefixes = new Set<string>();
  for (const file of files) {
    const match = file.filename.match(/\/content\/([a-z]{2}(?:-[a-zA-Z]+)?)\//);
    if (match) {
      allLocalePrefixes.add(`/content/${match[1]}/`);
    }
  }

  const localizedBasePaths = new Set<string>();
  for (const file of files) {
    if (file.filename.includes(localePrefix)) {
      localizedBasePaths.add(file.filename.replace(localePrefix, '/content/'));
    }
  }

  return files.filter((file) => {
    if (file.attributes['locale']) {
      return file.attributes['locale'] === locale;
    }
    if (file.filename.includes(localePrefix)) {
      return true;
    }
    for (const prefix of allLocalePrefixes) {
      if (prefix !== localePrefix && file.filename.includes(prefix)) {
        return false;
      }
    }
    return !localizedBasePaths.has(file.filename);
  });
}
