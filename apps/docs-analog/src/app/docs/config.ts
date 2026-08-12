import {
  EnvironmentProviders,
  InjectionToken,
  Provider,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import type { SidebarNode } from './sidebar';

export interface DocsBrandConfig {
  /** Display name in the header */
  name: string;
  /** Path to the logo (svg/png) shown in the header */
  logoSrc: string;
  /** Alt text on the logo image */
  logoAlt?: string;
  /** Route to navigate to when the header logo is clicked. Defaults to `/`. */
  homeLink?: string;
}

export interface DocsLocale {
  /** Locale code, e.g. `en`, `es`, `pt-br` */
  code: string;
  /** Display label in the locale picker */
  label: string;
}

export interface DocsLocalesConfig {
  /**
   * Default locale, served at the unprefixed root (`/`). All other locales
   * are served under `/<code>/`.
   */
  default: string;
  /** Locales the picker offers. The default locale should be included. */
  list: ReadonlyArray<DocsLocale>;
  /**
   * Locales currently in the search index but not necessarily offered to
   * users. Used by Search to recognize indexed locale prefixes and rewrite
   * hit URLs to the reader's active locale. Defaults to the codes in `list`.
   */
  indexed?: ReadonlyArray<string>;
}

export interface DocsSearchConfig {
  appId: string;
  apiKey: string;
  indexName: string;
}

export interface DocsNavLink {
  label: string;
  /** External URL — renders as a target=_blank anchor */
  href?: string;
  /** Internal route — renders as a routerLink */
  routerLink?: string;
}

export interface DocsFooterColumn {
  title: string;
  items: DocsNavLink[];
}

export interface DocsFooterBrand {
  /** Path to the logo (svg/png) shown in the brand column */
  logoSrc?: string;
  /** Alt text on the logo image */
  logoAlt?: string;
  /** Copyright line, e.g. `© 2026 Analog` */
  copyright?: string;
  /** Extra line below the copyright, e.g. the license */
  tagline?: string;
}

export interface DocsFooterConfig {
  /** Logo/copyright column rendered before the link columns. */
  brand?: DocsFooterBrand;
  columns?: DocsFooterColumn[];
  /** Copyright/license line, rendered below the columns. */
  legalLine?: string;
}

export interface DocsConfig {
  brand: DocsBrandConfig;
  /** Sidebar navigation tree shown on doc pages. */
  sidebar?: SidebarNode[];
  /** Locale picker config. Omit to disable the picker. */
  locales?: DocsLocalesConfig;
  /** Algolia DocSearch config. Omit to disable in-header search. */
  search?: DocsSearchConfig;
  /** Extra links shown in the desktop header nav. */
  headerNav?: DocsNavLink[];
  /** Footer link columns + legal line. */
  footer?: DocsFooterConfig;
  /**
   * Factory that returns the switch-locale callback used by the locale
   * picker. Called inside an injection context (the picker constructor),
   * so the body may use `inject()` — typically
   * `() => injectSwitchLocale()` from `@analogjs/router/i18n`.
   */
  switchLocaleFactory?: () => (code: string) => void;
}

export const ANALOG_DOCS_CONFIG = new InjectionToken<DocsConfig>(
  'ANALOG_DOCS_CONFIG',
);

export function provideAnalogDocs(
  configOrFactory: DocsConfig | (() => DocsConfig),
): EnvironmentProviders | Provider {
  // Accept a factory so $localize calls inside the config resolve
  // against translations loaded by provideI18n's app initializer.
  // useFactory defers evaluation until the token is first injected
  // (a component construction), well after bootstrap.
  return makeEnvironmentProviders([
    typeof configOrFactory === 'function'
      ? { provide: ANALOG_DOCS_CONFIG, useFactory: configOrFactory }
      : { provide: ANALOG_DOCS_CONFIG, useValue: configOrFactory },
  ]);
}

export function injectDocsConfig(): DocsConfig {
  return inject(ANALOG_DOCS_CONFIG);
}
