/// <reference types="vite/client" />

import type { Type } from '@angular/core';
import type { Route } from '@angular/router';
import { defineRouteMeta } from './define-route';

type Module = {
  default: Type<unknown>;
  routeMeta?: ReturnType<typeof defineRouteMeta>;
};

const FILES = import.meta.glob<Module>(['/routes/**/*.ts']);

const ROUTES = Object.keys(FILES).sort((a, b) => a.length - b.length);

const routeConfigs = ROUTES.reduce<Route[]>((routes: Route[], key: string) => {
  const module = FILES[key];

  const segments = key
    .replace(/\/routes|\.(js|ts)$/g, '')
    .replace(/\[\.{3}.+\]/, '**')
    .replace(/\[([^\]]+)\]/g, ':$1')
    .split('/')
    .filter(Boolean);

  segments.reduce((parent, segment, index) => {
    const path = segment.replace(/index/g, '').replace('.', '/');
    const isIndex = !path;
    const isCatchall = path === '**';
    const pathMatch = isIndex ? 'full' : undefined;
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
        parent._module().then((m: Module) => m.default);
      parent.loadChildren = () =>
        parent._module().then((m: Module) => {
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
  }, {} as Route & { _module: () => Promise<Module>; _children: any[] });

  return routes;
}, []);

export const routes: Route[] = [...routeConfigs];
