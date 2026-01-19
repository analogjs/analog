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
import { route } from './route-builder';

/**
 * Type-safe wrapper for Router.navigate().
 *
 * For static routes, only accepts navigation extras.
 * For dynamic routes, requires params and optionally accepts extras.
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
export function navigate(
  path: string,
  params?: Record<string, string | number>,
  extras?: NavigationExtras,
): Promise<boolean> {
  const router = inject(Router);
  const resolvedPath = params ? route(path, params) : path;
  return router.navigate([resolvedPath], extras);
}

/**
 * Type-safe wrapper for Router.navigateByUrl().
 *
 * For static routes, only accepts behavior options.
 * For dynamic routes, requires params and optionally accepts options.
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
export function navigateByUrl(
  path: string,
  params?: Record<string, string | number>,
  extras?: NavigationBehaviorOptions,
): Promise<boolean> {
  const router = inject(Router);
  const resolvedPath = params ? route(path, params) : path;
  return router.navigateByUrl(resolvedPath, extras);
}
