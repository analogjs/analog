import { InjectionToken, inject, Provider } from '@angular/core';

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
