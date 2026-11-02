import { Type } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateChildFn,
  CanActivateFn,
  CanDeactivateFn,
  CanMatchFn,
  DeprecatedGuard,
  MaybeAsync,
  RedirectCommand,
  Route,
  RouterStateSnapshot,
} from '@angular/router';

import { AnalogJsonLdDocument } from './json-ld';
import { MetaTag } from './meta-tags';
import type {
  AnalogRoutePath,
  RouteActivatedRouteSnapshot,
  RouteResourceContext,
  RouteResourceResult,
} from './to-route';

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

type RouteContextFor<P> = [P] extends [never]
  ? never
  : [P] extends [AnalogRoutePath]
    ? RouteResourceContext<P>
    : RouteResourceContext;

type RouteSnapshotFor<P> = [P] extends [never]
  ? never
  : [P] extends [AnalogRoutePath]
    ? RouteActivatedRouteSnapshot<P>
    : ActivatedRouteSnapshot;

type RouteResolveFn<T, P extends AnalogRoutePath | undefined = undefined> = (
  route: RouteSnapshotFor<P>,
  state: RouterStateSnapshot,
) => MaybeAsync<T | RedirectCommand>;

export interface DefaultRouteMeta<
  P extends AnalogRoutePath | undefined = undefined,
> extends Omit<
  Route,
  | OmittedRouteProps
  | keyof RedirectRouteMeta
  | 'resolve'
  | 'resources'
  | 'title'
> {
  canActivate?: CanActivateFn[] | DeprecatedGuard[];
  canActivateChild?: CanActivateChildFn[];
  canDeactivate?: CanDeactivateFn<unknown>[];
  canMatch?: CanMatchFn[];
  resolve?: { [key: string | symbol]: RouteResolveFn<unknown, P> };
  resources?: (
    ctx: RouteContextFor<P>,
  ) => RouteResourceResult | Promise<RouteResourceResult>;
  title?: string | RouteResolveFn<string, P>;
  meta?: MetaTag[] | RouteResolveFn<MetaTag[], P>;
  jsonLd?:
    | AnalogJsonLdDocument
    | RouteResolveFn<AnalogJsonLdDocument | undefined, P>;
}

export interface RedirectRouteMeta {
  redirectTo: string;
  pathMatch?: Route['pathMatch'];
}

export type RouteMeta<P extends AnalogRoutePath | undefined = undefined> =
  // enforce exclusive union
  (DefaultRouteMeta<P> & { redirectTo?: never }) | RedirectRouteMeta;

export type RouteExport = {
  default: Type<unknown>;
  routeMeta?: RouteMeta<never>;
};
