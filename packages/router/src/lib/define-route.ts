import { inject } from '@angular/core';
import { Route as NgRoute, Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';

import { AnalogJsonLdDocument } from './json-ld';
import { MetaTag } from './meta-tags';

type RouteOmitted =
  | 'component'
  | 'loadComponent'
  | 'loadChildren'
  | 'path'
  | 'pathMatch';

type RestrictedRoute = Omit<NgRoute, RouteOmitted> & {
  meta?: MetaTag[];
  jsonLd?: AnalogJsonLdDocument;
};

/**
 * @deprecated Use `RouteMeta` type instead.
 * For more info see: https://github.com/analogjs/analog/issues/223
 *
 * Defines additional route config metadata. This
 * object is merged into the route config with
 * the predefined file-based route.
 *
 * @usageNotes
 *
 * ```
 * import { Component } from '@angular/core';
 * import { defineRouteMeta } from '@analogjs/router';
 *
 *  export const routeMeta = defineRouteMeta({
 *    title: 'Welcome'
 *  });
 *
 * @Component({
 *   template: `Home`,
 *   standalone: true,
 * })
 * export default class HomeComponent {}
 * ```
 *
 * @param route
 * @returns
 */
export const defineRouteMeta = (route: RestrictedRoute): RestrictedRoute => {
  return route;
};

/**
 * Returns the instance of Angular Router
 *
 * @returns The router
 */
export const injectRouter = (): Router => {
  return inject(Router);
};

/**
 * Returns the instance of the Activate Route for the component
 *
 * @returns The activated route
 */
export const injectActivatedRoute = (): ActivatedRoute => {
  return inject(ActivatedRoute);
};
