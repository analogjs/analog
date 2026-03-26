import { InjectionToken, inject, Provider } from '@angular/core';

import { ContentFile } from './content-file';

/**
 * Token for the active content locale.
 * Provided via `withLocale()` in `provideContent()`.
 *
 * When set, `injectContentFiles()` filters to content matching this locale,
 * and `injectContent()` resolves locale-prefixed content paths first.
 */
export const CONTENT_LOCALE = new InjectionToken<string>(
  '@analogjs/content Locale',
);

/**
 * Injects the content locale, returning null if not configured.
 */
export function injectContentLocale(): string | null {
  return inject(CONTENT_LOCALE, { optional: true });
}

export interface ContentLocaleOptions {
  /**
   * Function that returns the active locale.
   * Runs in injection context so `inject()` can be used to read
   * from other tokens (e.g., a LOCALE token from a router package).
   *
   * ```typescript
   * withLocale({ loadLocale: injectLocale })
   * withLocale({ loadLocale: () => navigator.language.split('-')[0] })
   * ```
   */
  loadLocale: () => string | null;
}

/**
 * Content feature that sets the active locale for content resolution.
 *
 * When provided, content APIs become locale-aware:
 * - `injectContentFiles()` filters to files in the locale subdirectory
 *   or with a matching `locale` frontmatter attribute.
 * - `injectContent()` tries locale-prefixed paths first
 *   (e.g., `content/fr/blog/post.md` before `content/blog/post.md`).
 *
 * Usage:
 * ```typescript
 * // With loader — runs in injection context
 * provideContent(
 *   withMarkdownRenderer(),
 *   withLocale({ loadLocale: injectLocale }),
 * )
 *
 * // Static locale
 * provideContent(
 *   withMarkdownRenderer(),
 *   withLocale('fr'),
 * )
 * ```
 */
export function withLocale(locale: string | ContentLocaleOptions): Provider {
  if (typeof locale === 'string') {
    return { provide: CONTENT_LOCALE, useValue: locale };
  }

  return { provide: CONTENT_LOCALE, useFactory: locale.loadLocale };
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
export function filterByLocale<T extends Record<string, any>>(
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

/**
 * Prepends locale-prefixed candidates before the standard candidates
 * for content file map key lookup.
 */
export function withLocaleCandidates(
  candidates: string[],
  locale: string | null | undefined,
): string[] {
  if (!locale) {
    return candidates;
  }
  const localeCandidates = candidates.map((c) =>
    c.replace('/src/content/', `/src/content/${locale}/`),
  );
  return [...localeCandidates, ...candidates];
}
