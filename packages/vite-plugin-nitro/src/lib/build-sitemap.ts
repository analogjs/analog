import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { create } from 'xmlbuilder2';
import { XMLBuilder } from 'xmlbuilder2/lib/interfaces';
import { UserConfig } from 'vite';
import {
  PrerenderSitemapConfig,
  SitemapConfig,
  SitemapEntry,
  SitemapExcludeRule,
  SitemapRouteDefinition,
  SitemapRouteInput,
  SitemapRouteSource,
} from './options';

type RouteSitemapConfig =
  | PrerenderSitemapConfig
  | (() => PrerenderSitemapConfig)
  | undefined;

export type PagesJson = SitemapEntry;

export interface BuildSitemapOptions {
  apiPrefix?: string;
}

export async function buildSitemap(
  _config: UserConfig,
  sitemapConfig: SitemapConfig,
  routes: (string | undefined)[] | (() => Promise<(string | undefined)[]>),
  outputDir: string,
  routeSitemaps: Record<string, RouteSitemapConfig>,
  buildOptions: BuildSitemapOptions = {},
): Promise<void> {
  const host = normalizeSitemapHost(sitemapConfig.host);
  const routeList = await collectSitemapRoutes(routes, sitemapConfig.include);
  const sitemapData = await resolveSitemapEntries(
    routeList,
    host,
    routeSitemaps,
    sitemapConfig,
    buildOptions,
  );

  if (!sitemapData.length) {
    return;
  }

  const sitemap = createXml('urlset');

  for (const item of sitemapData) {
    const page = sitemap.ele('url');
    page.ele('loc').txt(item.loc);

    if (item.lastmod) {
      page.ele('lastmod').txt(item.lastmod);
    }

    if (item.changefreq) {
      page.ele('changefreq').txt(item.changefreq);
    }

    if (item.priority !== undefined) {
      page.ele('priority').txt(String(item.priority));
    }
  }

  const resolvedOutputDir = resolve(outputDir);
  const mapPath = resolve(resolvedOutputDir, 'sitemap.xml');
  try {
    if (!resolvedOutputDir || resolvedOutputDir === resolve()) {
      throw new Error(
        'Refusing to write the sitemap to the current working directory. Expected the Nitro public output directory instead.',
      );
    }

    if (!existsSync(resolvedOutputDir)) {
      mkdirSync(resolvedOutputDir, { recursive: true });
    }
    console.log(`Writing sitemap at ${mapPath}`);
    writeFileSync(mapPath, sitemap.end({ prettyPrint: true }));
  } catch (e) {
    console.error(`Unable to write file at ${mapPath}`, e);
  }
}

async function resolveSitemapEntries(
  routes: SitemapRouteInput[],
  host: string,
  routeSitemaps: Record<string, RouteSitemapConfig>,
  sitemapConfig: SitemapConfig,
  buildOptions: BuildSitemapOptions,
): Promise<SitemapEntry[]> {
  const defaults = sitemapConfig.defaults ?? {};
  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];

  for (const route of routes) {
    const entry = await toSitemapEntry(
      route,
      host,
      routeSitemaps,
      defaults,
      sitemapConfig.transform,
    );

    if (!entry) {
      continue;
    }

    if (
      isInternalSitemapRoute(entry.route, buildOptions.apiPrefix) ||
      (await isExcludedSitemapRoute(entry, sitemapConfig.exclude))
    ) {
      continue;
    }

    if (seen.has(entry.loc)) {
      continue;
    }

    seen.add(entry.loc);
    entries.push(entry);
  }

  return entries;
}

async function toSitemapEntry(
  route: SitemapRouteInput,
  host: string,
  routeSitemaps: Record<string, RouteSitemapConfig>,
  defaults: PrerenderSitemapConfig,
  transform: SitemapConfig['transform'],
): Promise<SitemapEntry | undefined> {
  const normalizedRoute = normalizeSitemapRoute(
    typeof route === 'string' ? route : route?.route,
  );
  if (!normalizedRoute) {
    return undefined;
  }

  const baseEntry = createSitemapEntry(
    {
      ...defaults,
      ...resolveRouteSitemapConfig(routeSitemaps[normalizedRoute]),
      ...(typeof route === 'object' ? route : {}),
      route: normalizedRoute,
    },
    host,
  );

  if (!transform) {
    return baseEntry;
  }

  const transformed = await transform(baseEntry);
  if (!transformed) {
    return undefined;
  }

  return createSitemapEntry(
    {
      ...baseEntry,
      ...transformed,
    },
    host,
  );
}

function createSitemapEntry(
  routeDefinition: SitemapRouteDefinition,
  host: string,
): SitemapEntry {
  const route = normalizeSitemapRoute(routeDefinition.route) ?? '/';

  return {
    route,
    loc: new URL(route, ensureTrailingSlash(host)).toString(),
    lastmod: routeDefinition.lastmod,
    changefreq: routeDefinition.changefreq,
    priority: routeDefinition.priority,
  };
}

function resolveRouteSitemapConfig(
  config: RouteSitemapConfig,
): PrerenderSitemapConfig {
  if (!config) {
    return {};
  }

  return typeof config === 'function' ? config() : config;
}

function normalizeSitemapHost(host: string): string {
  const resolvedHost = new URL(host);
  resolvedHost.hash = '';
  return resolvedHost.toString();
}

function ensureTrailingSlash(host: string): string {
  return host.endsWith('/') ? host : `${host}/`;
}

function normalizeSitemapRoute(route: string | undefined): string | undefined {
  if (!route) {
    return undefined;
  }

  const trimmedRoute = route.trim();
  if (!trimmedRoute) {
    return undefined;
  }

  const pathWithQuery = trimmedRoute.split('#', 1)[0] ?? '';
  const [pathname, search] = pathWithQuery.split('?', 2);
  const normalizedPathname = pathname
    ? `/${pathname.replace(/^\/+/, '').replace(/\/{2,}/g, '/')}`
    : '/';

  return search ? `${normalizedPathname}?${search}` : normalizedPathname;
}

function isInternalSitemapRoute(route: string, apiPrefix = 'api'): boolean {
  const normalizedApiPrefix = normalizeSitemapRoute(`/${apiPrefix}`) ?? '/api';
  return (
    route === `${normalizedApiPrefix}/_analog/pages` ||
    route.startsWith(`${normalizedApiPrefix}/_analog/pages/`)
  );
}

async function isExcludedSitemapRoute(
  entry: SitemapEntry,
  excludeRules: SitemapExcludeRule[] | undefined,
): Promise<boolean> {
  if (!excludeRules?.length) {
    return false;
  }

  for (const rule of excludeRules) {
    if (typeof rule === 'function') {
      if (await rule(entry)) {
        return true;
      }
      continue;
    }

    if (rule instanceof RegExp) {
      if (rule.test(entry.route)) {
        return true;
      }
      continue;
    }

    if (toGlobRegExp(rule).test(entry.route)) {
      return true;
    }
  }

  return false;
}

function toGlobRegExp(pattern: string): RegExp {
  const doubleStarToken = '__ANALOG_DOUBLE_STAR__';
  const singleStarToken = '__ANALOG_SINGLE_STAR__';
  const escapedPattern = pattern
    .replace(/\*\*/g, doubleStarToken)
    .replace(/\*/g, singleStarToken)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexPattern = escapedPattern
    .replace(new RegExp(doubleStarToken, 'g'), '.*')
    .replace(new RegExp(singleStarToken, 'g'), '[^/]*');
  return new RegExp(`^${regexPattern}$`);
}

async function collectSitemapRoutes(
  routes: (string | undefined)[] | (() => Promise<(string | undefined)[]>),
  include?: SitemapRouteSource,
): Promise<SitemapRouteInput[]> {
  const routeList = await resolveRouteInputs(routes);
  const includedRoutes = include ? await resolveRouteInputs(include) : [];
  return [...routeList, ...includedRoutes];
}

async function resolveRouteInputs(
  routes:
    | SitemapRouteSource
    | (string | undefined)[]
    | (() => Promise<(string | undefined)[]>),
): Promise<SitemapRouteInput[]> {
  let routeList: SitemapRouteInput[];

  if (typeof routes === 'function') {
    routeList = await routes();
  } else if (Array.isArray(routes)) {
    routeList = routes;
  } else {
    routeList = [];
  }

  return routeList.filter(Boolean);
}

/**
 * Generates hreflang alternate URLs for a given page URL.
 * For a URL like `https://example.com/fr/about`, it produces alternates
 * for all configured locales.
 */
export function getHreflangAlternates(
  pageUrl: string,
  host: string,
  i18n: I18nPrerenderOptions,
): { locale: string; href: string }[] {
  const alternates: { locale: string; href: string }[] = [];
  const normalizedHost = host.replace(/\/+$/, '');

  // Extract the path portion after the host
  const path = pageUrl.replace(normalizedHost, '');

  // Strip locale prefix to get the base path
  const basePath = stripLocalePrefix(path, i18n.locales);

  for (const locale of i18n.locales) {
    const localizedPath =
      basePath === '/' || basePath === ''
        ? `/${locale}`
        : `/${locale}${basePath}`;
    alternates.push({
      locale,
      href: `${normalizedHost}${localizedPath}`,
    });
  }

  // Add x-default pointing to the default locale variant
  const defaultPath =
    basePath === '/' || basePath === ''
      ? `/${i18n.defaultLocale}`
      : `/${i18n.defaultLocale}${basePath}`;
  alternates.push({
    locale: 'x-default',
    href: `${normalizedHost}${defaultPath}`,
  });

  return alternates;
}

/**
 * Strips a locale prefix from a URL path.
 * E.g., '/fr/about' -> '/about', '/en' -> '/'
 */
export function stripLocalePrefix(path: string, locales: string[]): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0 && locales.includes(segments[0])) {
    const rest = segments.slice(1).join('/');
    return rest ? `/${rest}` : '/';
  }
  return path || '/';
}

function createXml(
  elementName: 'urlset' | 'sitemapindex',
  includeXhtml = false,
): XMLBuilder {
  const attrs: Record<string, string> = {
    xmlns: 'https://www.sitemaps.org/schemas/sitemap/0.9',
  };
  if (includeXhtml) {
    attrs['xmlns:xhtml'] = 'https://www.w3.org/1999/xhtml';
  }

  return create({ version: '1.0', encoding: 'UTF-8' })
    .ele(elementName, attrs)
    .com(`This file was automatically generated by Analog.`);
}
