import { Type } from '@angular/core';
import {
  CanActivateChildFn,
  CanActivateFn,
  CanDeactivateFn,
  CanMatchFn,
  DeprecatedGuard,
  ResolveFn,
  Route,
} from '@angular/router';

import { defineRouteMeta } from './define-route';
import { MetaTag } from './meta-tags';

type OmittedRouteProps =
  | 'path'
  | 'matcher'
  | 'component'
  | 'loadComponent'
  | 'children'
  | 'loadChildren'
  | 'canLoad'
  | 'outlet';

export type RouteConfig = Omit<Route, OmittedRouteProps>;

export interface DefaultRouteMeta extends Omit<
  Route,
  OmittedRouteProps | keyof RedirectRouteMeta
> {
  canActivate?: CanActivateFn[] | DeprecatedGuard[];
  canActivateChild?: CanActivateChildFn[];
  canDeactivate?: CanDeactivateFn<unknown>[];
  canMatch?: CanMatchFn[];
  resolve?: { [key: string | symbol]: ResolveFn<unknown> };
  title?: string | ResolveFn<string>;
  meta?: MetaTag[] | ResolveFn<MetaTag[]>;
  /**
   * Returns the parameter sets to prerender for a parameterized route
   * when server routes are built with createServerRoutePaths.
   */
  getPrerenderParams?: () =>
    | Promise<Record<string, string>[]>
    | Record<string, string>[];
  /**
   * Set to `false` (a literal, read at build time) to render this page
   * per request instead of prerendering — for pages that depend on the
   * live request, e.g. fresh server-function data.
   */
  prerender?: boolean;
  /**
   * Set to `true` (a literal, read at build time) to render this page
   * through the progressive streaming renderer, flushing
   * `@defer (hydrate …)` blocks as they resolve. Implies
   * `prerender: false` — streaming needs a live request.
   */
  streaming?: boolean;
}

export interface RedirectRouteMeta {
  redirectTo: string;
  pathMatch?: Route['pathMatch'];
}

export type RouteMeta =
  // enforce exclusive union
  (DefaultRouteMeta & { redirectTo?: never }) | RedirectRouteMeta;

export type RouteExport = {
  default: Type<unknown>;
  routeMeta?: RouteMeta | ReturnType<typeof defineRouteMeta>;
};
