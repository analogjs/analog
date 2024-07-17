/// <reference types="vite/client" />

import type { Route } from '@angular/router';

import type { RouteExport, RouteMeta } from './models';
import { toRouteConfig } from './route-config';
import { toMarkdownModule } from './markdown-helpers';
import { APP_DIR, ENDPOINT_EXTENSION } from './constants';
import { ANALOG_META_KEY } from './endpoints';

const FILES = import.meta.glob<RouteExport>([
  '/app/routes/**/*.ts',
  '/src/app/routes/**/*.ts',
  '/src/app/pages/**/*.page.ts',
  '/src/app/pages/**/*.page.analog',
]);

const CONTENT_FILES = import.meta.glob<string>(
  ['/src/app/routes/**/*.md', '/src/app/pages/**/*.md'],
  { query: '?analog-content-file=true', import: 'default' }
);

export type Files = Record<string, () => Promise<RouteExport | string>>;

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

/**
 * A function used to parse list of files and create configuration of routes.
 *
 * @param files
 * @returns Array of routes
 */
export function createRoutes(files: Files): Route[] {
  const filenames = Object.keys(files);

  if (filenames.length === 0) {
    return [];
  }

  // map filenames to raw routes and group them by level
  const rawRoutesByLevelMap = filenames.reduce((acc, filename) => {
    const rawPath = toRawPath(filename);
    const rawSegments = rawPath.split('/');
    // nesting level starts at 0
    // rawPath: /products => level: 0
    // rawPath: /products/:id => level: 1
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

  // add each raw route to its parent's children array
  for (let level = maxLevel; level > 0; level--) {
    const rawRoutesMap = rawRoutesByLevelMap[level];
    const rawPaths = Object.keys(rawRoutesMap);

    for (const rawPath of rawPaths) {
      const rawRoute = rawRoutesMap[rawPath];
      const parentRawPath = rawRoute.ancestorRawSegments.join('/');
      const parentRawSegmentIndex = rawRoute.ancestorRawSegments.length - 1;
      const parentRawSegment =
        rawRoute.ancestorRawSegments[parentRawSegmentIndex];

      // create the parent level and/or raw route if it does not exist
      // parent route won't exist for nested routes that don't have a layout route
      rawRoutesByLevelMap[level - 1] ||= {};
      rawRoutesByLevelMap[level - 1][parentRawPath] ||= {
        filename: null,
        rawSegment: parentRawSegment,
        ancestorRawSegments: rawRoute.ancestorRawSegments.slice(
          0,
          parentRawSegmentIndex
        ),
        segment: toSegment(parentRawSegment),
        level: level - 1,
        children: [],
      };

      rawRoutesByLevelMap[level - 1][parentRawPath].children.push(rawRoute);
    }
  }

  // only take raw routes from the root level
  // since they already contain nested routes as their children
  const rootRawRoutesMap = rawRoutesByLevelMap[0];
  const rawRoutes = Object.keys(rootRawRoutesMap).map(
    (segment) => rootRawRoutesMap[segment]
  );
  sortRawRoutes(rawRoutes);

  return toRoutes(rawRoutes, files);
}

function toRawPath(filename: string): string {
  return filename
    .replace(
      // convert to relative path and remove file extension
      /^\/(.*?)\/routes\/|^\/(.*?)\/pages\/|\/app\/routes\/|(\.page\.(js|ts|analog)$)|(\.(ts|md|analog)$)/g,
      ''
    )
    .replace(/\[\.{3}.+\]/, '**') // [...not-found] => **
    .replace(/\[([^\]]+)\]/g, ':$1'); // [id] => :id
}

function toSegment(rawSegment: string): string {
  return rawSegment
    .replace(/index|\(.*?\)/g, '') // replace named empty segments
    .replace(/\.|\/+/g, '/') // replace dots with slashes and remove redundant slashes
    .replace(/^\/+|\/+$/g, ''); // remove trailing slashes
}

function toRoutes(rawRoutes: RawRoute[], files: Files): Route[] {
  const routes: Route[] = [];

  for (const rawRoute of rawRoutes) {
    const children: Route[] | undefined =
      rawRoute.children.length > 0
        ? toRoutes(rawRoute.children, files)
        : undefined;
    let module: (() => Promise<RouteExport>) | undefined = undefined;
    let analogMeta: { endpoint: string; endpointKey: string } | undefined =
      undefined;

    if (rawRoute.filename) {
      const isMarkdownFile = rawRoute.filename.endsWith('.md');
      module = isMarkdownFile
        ? toMarkdownModule(files[rawRoute.filename] as () => Promise<string>)
        : (files[rawRoute.filename] as () => Promise<RouteExport>);

      const endpointKey = rawRoute.filename.replace(
        /\.page\.(ts|analog)$/,
        ENDPOINT_EXTENSION
      );

      // get endpoint path
      const rawEndpoint = rawRoute.filename
        .replace(/\.page\.(ts|analog)$/, '')
        .replace(/\[\.{3}.+\]/, '**') // [...not-found] => **
        .split(APP_DIR)[1];

      // replace periods, remove (index) paths
      const endpoint = (rawEndpoint || '')
        .replace(/\./g, '/')
        .replace(/\/\((.*?)\)$/, '/-$1-');

      analogMeta = {
        endpoint,
        endpointKey,
      };
    }

    const route: Route & { meta?: typeof analogMeta } = module
      ? {
          path: rawRoute.segment,
          loadChildren: () =>
            module!().then((m) => {
              if (!import.meta.env.PROD) {
                const hasModuleDefault = !!m.default;
                const hasRedirect = !!m.routeMeta?.redirectTo;

                if (!hasModuleDefault && !hasRedirect) {
                  console.warn(
                    `[Analog] Missing default export at ${rawRoute.filename}`
                  );
                }
              }

              return [
                {
                  path: '',
                  component: m.default,
                  ...toRouteConfig(m.routeMeta as RouteMeta | undefined),
                  children,
                  [ANALOG_META_KEY]: analogMeta,
                },
              ];
            }),
        }
      : { path: rawRoute.segment, children };

    routes.push(route);
  }

  return routes;
}

function sortRawRoutes(rawRoutes: RawRoute[]): void {
  rawRoutes.sort((a, b) => {
    let segmentA = deprioritizeSegment(a.segment);
    let segmentB = deprioritizeSegment(b.segment);

    // prioritize routes with fewer children
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
  // deprioritize param and wildcard segments
  return segment.replace(':', '~~').replace('**', '~~~~');
}

export const routes: Route[] = createRoutes({ ...FILES, ...CONTENT_FILES });
