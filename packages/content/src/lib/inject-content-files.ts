import { inject } from '@angular/core';

import { ContentFile } from './content-file';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';
import { CONTENT_FILES_TOKEN } from './content-files-token';
import { CONTENT_LOCALE } from './content-locale';
import { RenderTaskService } from './render-task.service';

export function injectContentFiles<Attributes extends Record<string, any>>(
  filterFn?: InjectContentFilesFilterFunction<Attributes>,
): ContentFile<Attributes>[] {
  const renderTaskService = inject(RenderTaskService);
  const task = renderTaskService.addRenderTask();
  const allContentFiles = inject(
    CONTENT_FILES_LIST_TOKEN,
  ) as ContentFile<Attributes>[];
  const locale = inject(CONTENT_LOCALE, { optional: true });
  renderTaskService.clearRenderTask(task);

  let results = allContentFiles;

  if (locale) {
    results = filterByLocale(results, locale);
  }

  if (filterFn) {
    results = results.filter(filterFn);
  }

  return results;
}

/**
 * Filters content files by locale using map-based key lookup.
 *
 * Matching rules:
 * 1. Frontmatter `locale` attribute matches the active locale.
 * 2. File is in the active locale subdirectory (e.g., `/content/fr/blog/post`).
 * 3. File has no locale marker and no localized variant exists — included as universal content.
 *
 * Files in a different locale's subdirectory are always excluded.
 */
function filterByLocale<T extends Record<string, any>>(
  files: ContentFile<T>[],
  locale: string,
): ContentFile<T>[] {
  const localePrefix = `/content/${locale}/`;

  // Collect all locale prefixes present in the file set
  const allLocalePrefixes = new Set<string>();
  for (const file of files) {
    const match = file.filename.match(/\/content\/([a-z]{2}(?:-[a-zA-Z]+)?)\//);
    if (match) {
      allLocalePrefixes.add(`/content/${match[1]}/`);
    }
  }

  // Build set of base paths that have a localized variant for the active locale
  const localizedBasePaths = new Set<string>();
  for (const file of files) {
    if (file.filename.includes(localePrefix)) {
      localizedBasePaths.add(file.filename.replace(localePrefix, '/content/'));
    }
  }

  return files.filter((file) => {
    // Frontmatter locale attribute takes priority
    if (file.attributes['locale']) {
      return file.attributes['locale'] === locale;
    }
    // File is in the active locale subdirectory — include
    if (file.filename.includes(localePrefix)) {
      return true;
    }
    // File is in a different locale's subdirectory — exclude
    for (const prefix of allLocalePrefixes) {
      if (prefix !== localePrefix && file.filename.includes(prefix)) {
        return false;
      }
    }
    // Universal content — include only if no localized variant exists
    return !localizedBasePaths.has(file.filename);
  });
}

export type InjectContentFilesFilterFunction<T extends Record<string, any>> = (
  value: ContentFile<T>,
  index: number,
  array: ContentFile<T>[],
) => boolean;

export function injectContentFilesMap() {
  return inject(CONTENT_FILES_TOKEN);
}
