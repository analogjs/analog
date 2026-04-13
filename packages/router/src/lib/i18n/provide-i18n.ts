import {
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  InjectionToken,
  assertInInjectionContext,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { LOCALE, injectLocale } from '@analogjs/router/tokens';

declare const ANALOG_I18N_DEFAULT_LOCALE: string;
declare const ANALOG_I18N_LOCALES: string[];

/**
 * Configuration for runtime i18n support.
 *
 * `defaultLocale` and `locales` are optional when the platform plugin
 * is configured with `i18n` in `vite.config.ts` — the values are
 * injected as build-time globals automatically.
 */
export interface I18nConfig {
  /**
   * The default locale to use when no locale is detected.
   * If omitted, reads from the platform plugin's `i18n.defaultLocale`.
   */
  defaultLocale?: string;

  /**
   * List of supported locale identifiers.
   * If omitted, reads from the platform plugin's `i18n.locales`.
   */
  locales?: string[];

  /**
   * A function that returns translations for a given locale.
   * The returned record maps message IDs to translated strings.
   */
  loader: (
    locale: string,
  ) => Promise<Record<string, string>> | Record<string, string>;
}

/**
 * Fully resolved i18n config with all required fields.
 */
export type ResolvedI18nConfig = Required<I18nConfig>;

/**
 * Injection token for the resolved i18n configuration.
 * Provided by `provideI18n()`.
 */
export const I18N_CONFIG = new InjectionToken<ResolvedI18nConfig>(
  '@analogjs/router I18n Config',
);

/**
 * Resolves the full i18n config by merging explicit values with
 * build-time globals injected by the platform plugin.
 */
export function resolveI18nConfig(config: I18nConfig): Required<I18nConfig> {
  const defaultLocale =
    config.defaultLocale ??
    (typeof ANALOG_I18N_DEFAULT_LOCALE !== 'undefined'
      ? ANALOG_I18N_DEFAULT_LOCALE
      : undefined);

  const locales =
    config.locales ??
    (typeof ANALOG_I18N_LOCALES !== 'undefined'
      ? ANALOG_I18N_LOCALES
      : undefined);

  if (!defaultLocale || !locales) {
    throw new Error(
      '[@analogjs/router] provideI18n() requires defaultLocale and locales. ' +
        'Either pass them explicitly or configure i18n in the analog() plugin in vite.config.ts.',
    );
  }

  return { defaultLocale, locales, loader: config.loader };
}

/**
 * Provides runtime i18n support using Angular's $localize.
 *
 * This provider:
 * 1. Detects the active locale from the URL or falls back to the default.
 * 2. Makes the current locale available via the LOCALE injection token.
 * 3. Loads translations for the active locale at startup using $localize.
 *
 * Works in both SSR and client-only modes. On the client, locale is detected
 * from `window.location.pathname`. On the server, locale is detected from
 * the request in `provideServerContext()`.
 *
 * When the platform plugin is configured with `i18n` in `vite.config.ts`,
 * `defaultLocale` and `locales` are injected automatically — only
 * `loader` is required:
 *
 * ```typescript
 * provideI18n({
 *   loader: (locale) => import(`./i18n/${locale}.json`),
 * })
 * ```
 */
export function provideI18n(config: I18nConfig): EnvironmentProviders {
  const resolved = resolveI18nConfig(config);
  const detectedLocale = detectClientLocale(resolved);

  return makeEnvironmentProviders([
    { provide: I18N_CONFIG, useValue: resolved },
    { provide: LOCALE, useValue: detectedLocale },
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useFactory: () => {
        // Re-read LOCALE in case the server context overrode it
        const locale = injectLocale();
        return () => initI18n(resolved, locale ?? undefined);
      },
    },
  ]);
}

/**
 * Detects the locale on the client from the URL path prefix.
 * Returns the default locale on the server or when no match is found.
 */
export function detectClientLocale(config: ResolvedI18nConfig): string {
  if (typeof window === 'undefined') {
    return config.defaultLocale;
  }

  const pathname = window.location.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment && config.locales.includes(firstSegment)) {
    return firstSegment;
  }

  return config.defaultLocale;
}

/**
 * Loads translations for the given locale and registers them with $localize.
 */
export async function initI18n(
  config: ResolvedI18nConfig,
  locale?: string,
): Promise<void> {
  const activeLocale = locale ?? config.defaultLocale;

  // Skip loading translations for the source locale
  // (source messages are already in the templates)
  if (activeLocale === config.locales[0]) {
    return;
  }

  const translations = await config.loader(activeLocale);

  if (translations && Object.keys(translations).length > 0) {
    loadTranslationsRuntime(translations);
  }
}

/**
 * Loads translations into the global $localize translation map.
 * Requires @angular/localize/init to be imported in the application entry point.
 */
export function loadTranslationsRuntime(
  translations: Record<string, string>,
): void {
  const $localize = (globalThis as any).$localize;
  if (!$localize) {
    console.warn(
      '[@analogjs/router] $localize is not available. ' +
        'Make sure to import @angular/localize/init in your application entry point.',
    );
    return;
  }

  $localize.TRANSLATIONS ??= {};
  for (const [id, message] of Object.entries(translations)) {
    $localize.TRANSLATIONS[id] = message;
  }
}

/**
 * Returns an injectable function that switches the application locale.
 * Reads the configured locales from the I18N_CONFIG token provided
 * by `provideI18n()`.
 *
 * Triggers a full page navigation to the new locale URL so that
 * all $localize templates re-evaluate with the correct translations.
 *
 * Usage:
 * ```typescript
 * const switchLang = injectSwitchLocale();
 * switchLang('fr'); // navigates to /fr/current-path
 * ```
 */
export function injectSwitchLocale(): (targetLocale: string) => void {
  assertInInjectionContext(injectSwitchLocale);
  const config = inject(I18N_CONFIG);

  return (targetLocale: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    const { pathname, search, hash } = window.location;
    const newPath = replaceLocaleInPath(pathname, targetLocale, config.locales);
    window.location.href = `${newPath}${search}${hash}`;
  };
}

/**
 * Replaces or inserts the locale prefix in a URL path.
 *
 * - If the path starts with a known locale, it is swapped.
 * - If no locale prefix exists, the target locale is prepended.
 */
export function replaceLocaleInPath(
  pathname: string,
  targetLocale: string,
  locales: string[],
): string {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length > 0 && locales.includes(segments[0])) {
    segments[0] = targetLocale;
  } else {
    segments.unshift(targetLocale);
  }

  return '/' + segments.join('/');
}
