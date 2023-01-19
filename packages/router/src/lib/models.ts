import { Type } from '@angular/core';
import {
  CanActivateChildFn,
  CanActivateFn,
  CanDeactivateFn,
  CanMatchFn,
  ResolveFn,
  Route,
} from '@angular/router';

import { defineRouteMeta } from './define-route';

type OmittedRouteProps =
  | 'path'
  | 'pathMatch'
  | 'matcher'
  | 'redirectTo'
  | 'component'
  | 'loadComponent'
  | 'children'
  | 'loadChildren'
  | 'canLoad'
  | 'outlet';

interface DefaultRouteMeta extends Omit<Route, OmittedRouteProps> {
  canActivate?: CanActivateFn[];
  canActivateChild?: CanActivateChildFn[];
  canDeactivate?: CanDeactivateFn<unknown>[];
  canMatch?: CanMatchFn[];
  resolve?: { [key: string | symbol]: ResolveFn<unknown> };
  title?: string | ResolveFn<string>;
}

interface RedirectRouteMeta {
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
