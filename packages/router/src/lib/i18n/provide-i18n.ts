import {
  EnvironmentProviders,
  InjectionToken,
  Type,
  assertInInjectionContext,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { LOCALE, REQUEST, ServerRequest } from '@analogjs/router/tokens';

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
 * Provided by `provideI18n()` and consumed by `injectSwitchLocale()`.
 * @internal
 */
const I18N_CONFIG = new InjectionToken<ResolvedI18nConfig>(
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
 * the request in `provideServerContext()` and provided at the platform level;
 * this function does not shadow it.
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

  // Only provide LOCALE at the environment level on the client. On the
  // server, the platform-level LOCALE set by `provideServerContext()` is
  // authoritative and must not be shadowed by an environment-level provider.
  const localeProviders =
    typeof window !== 'undefined'
      ? [{ provide: LOCALE, useValue: detectClientLocale(resolved) }]
      : [];

  return makeEnvironmentProviders([
    { provide: I18N_CONFIG, useValue: resolved },
    ...localeProviders,
    provideAppInitializer(async () => {
      const locale = resolveActiveLocale(resolved);
      await initI18n(resolved, locale);
    }),
  ]);
}

/**
 * Resolves the active locale, preferring the injected `LOCALE` token
 * (which on the server reads from the platform-level provider set by
 * `provideServerContext()`) and falling back to the request URL,
 * `window.location.pathname`, or `defaultLocale`.
 */
function resolveActiveLocale(config: ResolvedI18nConfig): string {
  const injected = inject(LOCALE, { optional: true });
  if (injected && config.locales.includes(injected)) {
    return injected;
  }

  // Fallback: read the path directly from the request on the server or
  // from the browser URL on the client. This covers cases where a locale
  // prefix is present in the URL but no token provider set it explicitly.
  const req = inject(REQUEST, { optional: true }) as ServerRequest | null;
  const pathname =
    req?.originalUrl ??
    req?.url ??
    (typeof window !== 'undefined' ? window.location.pathname : '/');
  const first = pathname.split('?')[0].split('/').filter(Boolean)[0];
  if (first && config.locales.includes(first)) {
    return first;
  }

  return config.defaultLocale;
}

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
 *
 * Always clears any previously loaded translations first so that switching
 * between locales in a single SSR process does not mix translation maps.
 */
export async function initI18n(
  config: ResolvedI18nConfig,
  locale?: string,
): Promise<void> {
  const activeLocale = locale ?? config.defaultLocale;
  await clearTranslationsRuntime();

  // The source locale (first entry in `locales`) has its messages baked
  // directly into the template source, so there is nothing to load.
  if (activeLocale === config.locales[0]) {
    return;
  }

  const translations = await config.loader(activeLocale);
  if (translations && Object.keys(translations).length > 0) {
    await loadTranslationsRuntime(translations);
  }
}

/**
 * Loads translations into the global $localize translation map.
 *
 * Uses `@angular/localize`'s `loadTranslations` when available so that
 * each translation string is parsed into the `{text, messageParts,
 * placeholderNames}` shape that `$localize.translate` expects. Falls back
 * to writing raw strings only as a last resort (in which case lookups
 * will not succeed — the fallback exists to keep error messages useful
 * for users who have not installed `@angular/localize`).
 *
 * Requires `@angular/localize/init` to be imported in the application
 * entry point so that `globalThis.$localize` is defined.
 */
export async function loadTranslationsRuntime(
  translations: Record<string, string>,
): Promise<void> {
  const $localize = (globalThis as any).$localize;
  if (!$localize) {
    console.warn(
      '[@analogjs/router] $localize is not available. ' +
        'Make sure to import @angular/localize/init in your application entry point.',
    );
    return;
  }

  try {
    const { loadTranslations } = (await import('@angular/localize')) as {
      loadTranslations: (t: Record<string, string>) => void;
    };
    loadTranslations(translations);
  } catch {
    console.warn(
      '[@analogjs/router] Unable to import @angular/localize. ' +
        'Install it as a dependency to enable runtime translation loading.',
    );
    $localize.TRANSLATIONS ??= {};
    for (const [id, message] of Object.entries(translations)) {
      $localize.TRANSLATIONS[id] = message;
    }
  }
}

/** @internal — exported for tests; not re-exported from the package entry. */
export async function clearTranslationsRuntime(): Promise<void> {
  const $localize = (globalThis as any).$localize;
  if (!$localize) {
    return;
  }
  try {
    const { clearTranslations } = (await import('@angular/localize')) as {
      clearTranslations: () => void;
    };
    clearTranslations();
  } catch {
    $localize.translate = undefined;
    $localize.TRANSLATIONS = {};
  }
}

// ---------------------------------------------------------------------------
// Component definition registry
// ---------------------------------------------------------------------------

const componentDefRegistry = new Set<any>();

/** @internal */
export function ɵregisterI18nComponentDef(typeOrDef: Type<any> | any): void {
  if (!typeOrDef) return;
  const def = (typeOrDef as any).ɵcmp ?? typeOrDef;
  if (def && typeof def === 'object' && 'template' in def) {
    componentDefRegistry.add(def);
  }
}

/** @internal */
export function ɵresetI18nComponentDefCache(): void {
  for (const def of componentDefRegistry) {
    def.tView = null;
  }
}

/** @internal */
export function getI18nComponentDefRegistrySize(): number {
  return componentDefRegistry.size;
}

/** @internal */
export function clearI18nComponentDefRegistry(): void {
  componentDefRegistry.clear();
}

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
