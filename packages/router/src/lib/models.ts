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

export interface DefaultRouteMeta
  extends Omit<Route, OmittedRouteProps | keyof RedirectRouteMeta> {
  canActivate?: CanActivateFn[] | DeprecatedGuard[];
  canActivateChild?: CanActivateChildFn[];
  canDeactivate?: CanDeactivateFn<unknown>[];
  canMatch?: CanMatchFn[];
  resolve?: { [key: string | symbol]: ResolveFn<unknown> };
  title?: string | ResolveFn<string>;
  meta?: MetaTag[] | ResolveFn<MetaTag[]>;
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
