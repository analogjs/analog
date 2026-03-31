import { UrlSegment } from '@angular/router';
import type { Route } from '@angular/router';
import type { UrlMatcher } from '@angular/router';

import type { DefaultRouteMeta, RouteExport, RouteMeta } from './models';
import { toRouteConfig } from './route-config';
import { ENDPOINT_EXTENSION } from './constants';
import { ANALOG_META_KEY } from './endpoints';

export type RouteModuleFactory = () => Promise<RouteExport>;

export type RouteModuleResolver<TFile> = (
  filename: string,
  fileLoader: () => Promise<TFile>,
) => RouteModuleFactory;

type RawRoute = {
  filename: string | null;
  rawSegment: string;
  ancestorRawSegments: string[];
  segment: string;
  level: number;
  children: RawRoute[];
};

type RawRouteMap = Record<string, RawRoute>;
type RawRouteByLevelMap = Record<number, RawRouteMap>;

export function createRoutes<TFile>(
  files: Record<string, () => Promise<TFile>>,
  resolveModule: RouteModuleResolver<TFile>,
  debug = false,
): Route[] {
  const filenames = Object.keys(files);

  if (filenames.length === 0) {
    return [];
  }

  const rawRoutesByLevelMap = filenames.reduce((acc, filename) => {
    const rawPath = toRawPath(filename);
    const rawSegments = rawPath.split('/');
    const level = rawSegments.length - 1;
    const rawSegment = rawSegments[level];
    const ancestorRawSegments = rawSegments.slice(0, level);

    return {
      ...acc,
      [level]: {
        ...acc[level],
        [rawPath]: {
          filename,
          rawSegment,
          ancestorRawSegments,
          segment: toSegment(rawSegment),
          level,
          children: [],
        },
      },
    };
  }, {} as RawRouteByLevelMap);

  const allLevels = Object.keys(rawRoutesByLevelMap).map(Number);
  const maxLevel = Math.max(...allLevels);

  for (let level = maxLevel; level > 0; level--) {
    const rawRoutesMap = rawRoutesByLevelMap[level];
    const rawPaths = Object.keys(rawRoutesMap);

    for (const rawPath of rawPaths) {
      const rawRoute = rawRoutesMap[rawPath];
      const parentRawPath = rawRoute.ancestorRawSegments.join('/');
      const parentRawSegmentIndex = rawRoute.ancestorRawSegments.length - 1;
      const parentRawSegment =
        rawRoute.ancestorRawSegments[parentRawSegmentIndex];

      rawRoutesByLevelMap[level - 1] ||= {};
      rawRoutesByLevelMap[level - 1][parentRawPath] ||= {
        filename: null,
        rawSegment: parentRawSegment,
        ancestorRawSegments: rawRoute.ancestorRawSegments.slice(
          0,
          parentRawSegmentIndex,
        ),
        segment: toSegment(parentRawSegment),
        level: level - 1,
        children: [],
      };

      rawRoutesByLevelMap[level - 1][parentRawPath].children.push(rawRoute);
    }
  }

  const rootRawRoutesMap = rawRoutesByLevelMap[0];
  const rawRoutes = Object.keys(rootRawRoutesMap).map(
    (segment) => rootRawRoutesMap[segment],
  );
  sortRawRoutes(rawRoutes);

  return toRoutes(rawRoutes, files, resolveModule, debug);
}

/**
 * Strips directory prefixes and file extensions from a route filename to
 * produce the raw path used for route segment construction.
 *
 * The regex mirrors `filenameToRoutePath` in route-manifest.ts — changes
 * here must be kept in sync with that function. The first alternation
 * strips everything up to and including the first /routes/, /pages/, or
 * /content/ segment, which handles both app-local and additional directory
 * paths (e.g. `additionalPagesDirs`, `additionalContentDirs`).
 */
function toRawPath(filename: string): string {
  return filename
    .replace(
      /^(?:[a-zA-Z]:[\\/])?(.*?)[\\/](?:routes|pages|content)[\\/]|(?:[\\/](?:app[\\/](?:routes|pages)|src[\\/]content)[\\/])|(\.page\.(js|ts|analog|ag)$)|(\.(ts|md|analog|ag)$)/g,
      '',
    )
    .replace(/\[\[\.\.\.([^\]]+)\]\]/g, '(opt-$1)')
    .replace(/\[\.{3}.+\]/, '**')
    .replace(/\[([^\]]+)\]/g, ':$1');
}

function toSegment(rawSegment: string): string {
  return rawSegment
    .replace(/\(.*?\)/g, '')
    .replace(/(^|[./])index(?=[./]|$)/g, '$1')
    .replace(/\.|\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function createOptionalCatchAllMatcher(paramName: string): UrlMatcher {
  return (segments) => {
    if (segments.length === 0) {
      return null;
    }
    const joined = segments.map((s) => s.path).join('/');
    return {
      consumed: segments,
      posParams: { [paramName]: new UrlSegment(joined, {}) },
    };
  };
}

function toRoutes<TFile>(
  rawRoutes: RawRoute[],
  files: Record<string, () => Promise<TFile>>,
  resolveModule: RouteModuleResolver<TFile>,
  debug = false,
): Route[] {
  const routes: Route[] = [];

  for (const rawRoute of rawRoutes) {
    const children: Route[] | undefined =
      rawRoute.children.length > 0
        ? toRoutes(rawRoute.children, files, resolveModule, debug)
        : undefined;
    let module: RouteModuleFactory | undefined;
    let analogMeta: { endpoint: string; endpointKey: string } | undefined;

    if (rawRoute.filename) {
      if (!debug) {
        module = resolveModule(rawRoute.filename, files[rawRoute.filename]);
      }

      if (/\.page\.(ts|analog|ag)$/.test(rawRoute.filename)) {
        const endpointKey = rawRoute.filename.replace(
          /\.page\.(ts|analog|ag)$/,
          ENDPOINT_EXTENSION,
        );

        const rawEndpoint = rawRoute.filename
          .replace(/\.page\.(ts|analog|ag)$/, '')
          .replace(/\[\[\.\.\..+\]\]/, '**')
          .replace(/\[\.{3}.+\]/, '**')
          .replace(/^(.*?)\/pages/, '/pages');

        const endpoint = (rawEndpoint || '')
          .replace(/\./g, '/')
          .replace(/\/\((.*?)\)$/, '/-$1-');

        analogMeta = {
          endpoint,
          endpointKey,
        };
      }
    }

    const optCatchAllMatch = rawRoute.filename?.match(/\[\[\.\.\.([^\]]+)\]\]/);
    const optCatchAllParam = optCatchAllMatch ? optCatchAllMatch[1] : null;

    type DebugRoute = Route & {
      filename?: string | null | undefined;
      isLayout?: boolean;
    };

    const route: Route & { meta?: typeof analogMeta } & DebugRoute = module
      ? {
          path: rawRoute.segment,
          loadChildren: () =>
            module!().then((m) => {
              if (import.meta.env.DEV) {
                const hasModuleDefault = !!m.default;
                const hasRedirect = !!m.routeMeta?.redirectTo;

                if (!hasModuleDefault && !hasRedirect) {
                  console.warn(
                    `[Analog] Missing default export at ${rawRoute.filename}`,
                  );
                }
              }

              const routeMeta = mergeRouteJsonLdIntoRouteMeta(
                m.routeMeta as RouteMeta | undefined,
                m.routeJsonLd,
              );

              const routeConfig = toRouteConfig(routeMeta);
              const hasRedirect = 'redirectTo' in routeConfig;
              const baseChild = hasRedirect
                ? {
                    path: '',
                    ...routeConfig,
                  }
                : {
                    path: '',
                    component: m.default,
                    ...routeConfig,
                    children,
                    [ANALOG_META_KEY]: analogMeta,
                  };

              return [
                {
                  ...baseChild,
                },
                ...(optCatchAllParam
                  ? [
                      {
                        matcher:
                          createOptionalCatchAllMatcher(optCatchAllParam),
                        ...(hasRedirect
                          ? routeConfig
                          : {
                              component: m.default,
                              ...routeConfig,
                              [ANALOG_META_KEY]: analogMeta,
                            }),
                      },
                    ]
                  : []),
              ];
            }),
        }
      : {
          path: rawRoute.segment,
          ...(debug
            ? {
                filename: rawRoute.filename ? rawRoute.filename : undefined,
                isLayout: children && children.length > 0 ? true : false,
              }
            : {}),
          children,
        };

    routes.push(route);
  }

  return routes;
}

function mergeRouteJsonLdIntoRouteMeta(
  routeMeta: RouteMeta | undefined,
  routeJsonLd: RouteExport['routeJsonLd'],
): RouteMeta | undefined {
  if (!routeJsonLd) {
    return routeMeta;
  }

  if (!routeMeta) {
    return { jsonLd: routeJsonLd };
  }

  if (isRedirectRouteMeta(routeMeta) || routeMeta.jsonLd) {
    return routeMeta;
  }

  return {
    ...routeMeta,
    jsonLd: routeJsonLd,
  };
}

function isRedirectRouteMeta(
  routeMeta: RouteMeta,
): routeMeta is Exclude<RouteMeta, DefaultRouteMeta> {
  return 'redirectTo' in routeMeta && !!routeMeta.redirectTo;
}

function sortRawRoutes(rawRoutes: RawRoute[]): void {
  rawRoutes.sort((a, b) => {
    let segmentA = deprioritizeSegment(a.segment);
    let segmentB = deprioritizeSegment(b.segment);

    if (a.children.length > b.children.length) {
      segmentA = `~${segmentA}`;
    } else if (a.children.length < b.children.length) {
      segmentB = `~${segmentB}`;
    }

    return segmentA > segmentB ? 1 : -1;
  });

  for (const rawRoute of rawRoutes) {
    sortRawRoutes(rawRoute.children);
  }
}

function deprioritizeSegment(segment: string): string {
  return segment.replaceAll(':', '~~').replaceAll('**', '~~~~');
}
