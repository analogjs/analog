/// <reference types="vite/client" />

import type { Type } from '@angular/core';
import type { Route } from '@angular/router';
import { defineRouteMeta } from './define-route';

export type RouteExport = {
  default: Type<unknown>;
  routeMeta?: ReturnType<typeof defineRouteMeta>;
};

const FILES = import.meta.glob<RouteExport>([
  '/app/routes/**/*.ts',
  '/src/app/routes/**/*.ts',
]);

const CONTENT_FILES_GLOB = import.meta.glob<RouteExport>(
  ['/src/app/routes/**/*.md'],
  { as: 'raw', eager: true }
);

const CONTENT_FILES: Record<string, () => Promise<RouteExport>> = Object.keys(
  CONTENT_FILES_GLOB
).reduce((curr, key) => {
  curr = {
    ...curr,
    [key]: () => Promise.resolve(CONTENT_FILES_GLOB[key]),
  };

  return curr;
}, {});

/**
 * Function used to parse list of files and return
 * configuration of routes.
 *
 * @param files
 * @returns Array of routes
 */
export function getRoutes(files: Record<string, () => Promise<RouteExport>>) {
  const ROUTES = Object.keys(files).sort((a, b) => a.length - b.length);

  const routeConfigs = ROUTES.reduce<Route[]>(
    (routes: Route[], key: string) => {
      const module = key.endsWith('.md')
        ? () =>
            import('./markdown.component').then((m) => ({
              default: m.default,
              routeMeta: {
                data: { _analogContent: files[key] },
              },
            }))
        : files[key];

      const segments = key
        .replace(/^\/(.*?)\/routes|\/app\/routes|\.(js|ts|md)$/g, '')
        .replace(/\[\.{3}.+\]/, '**')
        .replace(/\[([^\]]+)\]/g, ':$1')
        .split('/')
        .filter(Boolean);

      segments.reduce((parent, segment, index) => {
        const path = segment.replace(/index|^\(.*?\)$/g, '').replace('.', '/');
        const isIndex = !path;
        const isCatchall = path === '**';
        const pathMatch = isIndex ? 'full' : 'prefix';
        const root = index === 0;
        const leaf = index === segments.length - 1 && segments.length > 1;
        const node = !root && !leaf;
        const insert = /^\w|\//.test(path) && !isCatchall ? 'unshift' : 'push';

        if (root) {
          const dynamic = path.startsWith(':');
          if (dynamic) return parent;

          const last = segments.length === 1;
          if (last) {
            const newRoute = {
              path,
              pathMatch,
              _module: () => module(),
              loadChildren: () =>
                module().then((m) => [
                  {
                    path: '',
                    component: m.default,
                    ...m.routeMeta,
                  },
                ]),
            };

            routes?.[insert](newRoute as Route);
            return parent;
          }
        }

        if (root || node) {
          const current = root ? routes : parent._children;
          const found = current?.find((route: any) => route.path === path);

          if (found) {
            if (!found._children) {
              found._children = [];
            }

            found.pathMatch = pathMatch;
          } else {
            current?.[insert]({
              path,
              pathMatch,
              _module: () => module(),
              loadChildren: () =>
                module().then((m) => [
                  {
                    path: '',
                    component: m.default,
                    ...m.routeMeta,
                  },
                ]),
            });
          }

          return (
            found ||
            (current?.[insert === 'unshift' ? 0 : current.length - 1] as Route)
          );
        }

        if (leaf) {
          parent?._children?.[insert]({
            path,
            pathMatch,
            _module: () => module(),
            loadChildren: () =>
              module().then((m) => [
                {
                  path: '',
                  component: m.default,
                  ...m.routeMeta,
                },
              ]),
          });
        }

        if (parent._children) {
          parent.loadComponent = () =>
            parent._module().then((m: RouteExport) => m.default);
          parent.loadChildren = () =>
            parent._module().then((m: RouteExport) => {
              return [
                {
                  path: '',
                  children: parent._children,
                  ...m.routeMeta,
                },
              ];
            });
        }

        return parent;
      }, {} as Route & { _module: () => Promise<RouteExport>; _children: any[] });

      return routes;
    },
    []
  );

  return routeConfigs;
}

export const routes: Route[] = [...getRoutes({ ...FILES, ...CONTENT_FILES })];
