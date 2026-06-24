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

export interface DocsFooterConfig {
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
}

export const ANALOG_DOCS_CONFIG = new InjectionToken<DocsConfig>(
  'ANALOG_DOCS_CONFIG',
);

export function provideAnalogDocs(
  config: DocsConfig,
): EnvironmentProviders | Provider {
  return makeEnvironmentProviders([
    { provide: ANALOG_DOCS_CONFIG, useValue: config },
  ]);
}

export function injectDocsConfig(): DocsConfig {
  return inject(ANALOG_DOCS_CONFIG);
}
