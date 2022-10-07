import { inject } from '@angular/core';
import { Route as NgRoute, Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';

type RouteOmitted =
  | 'component'
  | 'loadComponent'
  | 'loadChildren'
  | 'path'
  | 'pathMatch';

type RestrictedRoute = Omit<NgRoute, RouteOmitted>;

/**
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
export const defineRouteMeta = (route: RestrictedRoute) => {
  return route;
};

/**
 * Returns the instance of Angular Router
 *
 * @returns The router
 */
export const injectRouter = () => {
  return inject(Router);
};

/**
 * Returns the instance of the Activate Route for the component
 *
 * @returns The router
 */
export const injectRoute = () => {
  return inject(ActivatedRoute);
};
