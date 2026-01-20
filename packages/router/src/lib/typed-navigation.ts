/**
 * Type-safe navigation wrappers for Angular Router.
 *
 * Provides type-safe alternatives to Router.navigate() and Router.navigateByUrl().
 */

import { assertInInjectionContext, inject } from '@angular/core';
import {
  Router,
  NavigationExtras,
  NavigationBehaviorOptions,
} from '@angular/router';
import { route } from './route-builder';

/**
 * Type for the navigate function returned by injectNavigate().
 */
export type NavigateFn = <T extends string = string>(
  path: T,
  params?: Record<string, string | number>,
  extras?: NavigationExtras,
) => Promise<boolean>;

/**
 * Type for the navigateByUrl function returned by injectNavigateByUrl().
 */
export type NavigateByUrlFn = <T extends string = string>(
  path: T,
  params?: Record<string, string | number>,
  extras?: NavigationBehaviorOptions,
) => Promise<boolean>;

/**
 * Injects a type-safe navigate function.
 *
 * Must be called within an injection context (component constructor, field initializer, etc.).
 * Returns a function that can be called anywhere, including event handlers and callbacks.
 *
 * **Important**: This function requires `routes.d.ts` to be generated for
 * type safety. Run `npm run dev` or `npm run build` to generate it.
 *
 * @example
 * @Component({...})
 * export default class ProductComponent {
 *   private navigate = injectNavigate();
 *
 *   goToProduct(productId: string) {
 *     this.navigate('/products/[productId]', { productId });
 *   }
 *
 *   goToAbout() {
 *     this.navigate('/about');
 *   }
 *
 *   goWithExtras() {
 *     this.navigate('/products/[productId]', { productId: '123' }, {
 *       queryParams: { ref: 'home' },
 *       replaceUrl: true,
 *     });
 *   }
 * }
 *
 * @returns A type-safe navigate function
 */
export function injectNavigate(): NavigateFn {
  assertInInjectionContext(injectNavigate);
  const router = inject(Router);
  return <T extends string = string>(
    path: T,
    params?: Record<string, string | number>,
    extras?: NavigationExtras,
  ): Promise<boolean> => {
    const resolvedPath = params ? route(path, params) : (path as string);
    return router.navigate([resolvedPath], extras);
  };
}

/**
 * Injects a type-safe navigateByUrl function.
 *
 * Must be called within an injection context (component constructor, field initializer, etc.).
 * Returns a function that can be called anywhere, including event handlers and callbacks.
 *
 * **Important**: This function requires `routes.d.ts` to be generated for
 * type safety. Run `npm run dev` or `npm run build` to generate it.
 *
 * @example
 * @Component({...})
 * export default class ProductComponent {
 *   private navigateByUrl = injectNavigateByUrl();
 *
 *   goToAbout() {
 *     this.navigateByUrl('/about');
 *   }
 *
 *   goToProduct() {
 *     this.navigateByUrl('/products/[productId]', { productId: '123' });
 *   }
 *
 *   goWithExtras() {
 *     this.navigateByUrl('/products/[productId]', { productId: '123' }, {
 *       replaceUrl: true,
 *     });
 *   }
 * }
 *
 * @returns A type-safe navigateByUrl function
 */
export function injectNavigateByUrl(): NavigateByUrlFn {
  assertInInjectionContext(injectNavigateByUrl);
  const router = inject(Router);
  return <T extends string = string>(
    path: T,
    params?: Record<string, string | number>,
    extras?: NavigationBehaviorOptions,
  ): Promise<boolean> => {
    const resolvedPath = params ? route(path, params) : (path as string);
    return router.navigateByUrl(resolvedPath, extras);
  };
}
