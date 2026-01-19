/**
 * Type-safe navigation wrappers for Angular Router.
 *
 * Provides type-safe alternatives to Router.navigate() and Router.navigateByUrl().
 */

import { inject } from '@angular/core';
import {
  Router,
  NavigationExtras,
  NavigationBehaviorOptions,
} from '@angular/router';
import { route, TypedRoute } from './route-builder';

/**
 * Type-safe wrapper for Router.navigate().
 *
 * For static routes, only accepts navigation extras.
 * For dynamic routes, requires params and optionally accepts extras.
 *
 * **Important**: This function requires `routes.d.ts` to be generated for
 * type safety. Run `npm run dev` or `npm run build` to generate it.
 *
 * @example
 * // Static route
 * navigate('/about');
 * navigate('/about', undefined, { replaceUrl: true });
 *
 * // Dynamic route
 * navigate('/products/[productId]', { productId: '123' });
 * navigate('/products/[productId]', { productId: '123' }, { replaceUrl: true });
 *
 * @param path - The route path
 * @param params - Route parameters (required for dynamic routes, undefined for static)
 * @param extras - Navigation extras
 * @returns Promise that resolves to true if navigation succeeds
 */
export function navigate<T extends TypedRoute>(
  path: T,
  params?: Record<string, string | number>,
  extras?: NavigationExtras,
): Promise<boolean> {
  const router = inject(Router);
  const resolvedPath = params ? route(path, params) : (path as string);
  return router.navigate([resolvedPath], extras);
}

/**
 * Type-safe wrapper for Router.navigateByUrl().
 *
 * For static routes, only accepts behavior options.
 * For dynamic routes, requires params and optionally accepts options.
 *
 * **Important**: This function requires `routes.d.ts` to be generated for
 * type safety. Run `npm run dev` or `npm run build` to generate it.
 *
 * @example
 * // Static route
 * navigateByUrl('/about');
 * navigateByUrl('/about', undefined, { replaceUrl: true });
 *
 * // Dynamic route
 * navigateByUrl('/products/[productId]', { productId: '123' });
 * navigateByUrl('/products/[productId]', { productId: '123' }, { replaceUrl: true });
 *
 * @param path - The route path
 * @param params - Route parameters (required for dynamic routes, undefined for static)
 * @param extras - Navigation behavior options
 * @returns Promise that resolves to true if navigation succeeds
 */
export function navigateByUrl<T extends TypedRoute>(
  path: T,
  params?: Record<string, string | number>,
  extras?: NavigationBehaviorOptions,
): Promise<boolean> {
  const router = inject(Router);
  const resolvedPath = params ? route(path, params) : (path as string);
  return router.navigateByUrl(resolvedPath, extras);
}
