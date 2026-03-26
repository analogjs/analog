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
 * provideContent(
 *   withMarkdownRenderer(),
 *   withLocale('fr'),
 * )
 * ```
 */
export function withLocale(locale: string): Provider {
  return { provide: CONTENT_LOCALE, useValue: locale };
}
