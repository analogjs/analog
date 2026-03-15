import { inject } from '@angular/core';
import { Router } from '@angular/router';

import type {
  AnalogRoutePath,
  RoutePathArgs,
  RoutePathOptionsBase,
} from './route-path';
import { buildUrl } from './route-path';

/**
 * Injects a typed router that wraps Angular Router with
 * type-safe navigation helpers.
 *
 * The route path autocomplete and param typing come from the
 * generated `.analog/routes.gen.ts` file which augments the
 * `AnalogRouteTable` interface.
 *
 * @example
 * ```ts
 * const router = injectTypedRouter();
 *
 * // Type-safe navigation with autocomplete on paths
 * router.navigate('/users/[id]', { params: { id: '42' } });
 *
 * // Build a UrlTree for RouterLink
 * const tree = router.createUrlTree('/users/[id]', { params: { id: '42' } });
 *
 * // Just build the URL string
 * const url = router.url('/users/[id]', { params: { id: '42' } });
 * ```
 */
export function injectTypedRouter() {
  const router = inject(Router);

  return {
    /** Navigate to a typed route path. */
    navigate<P extends AnalogRoutePath>(
      path: P,
      ...args: RoutePathArgs<P>
    ): Promise<boolean> {
      const url = buildUrl(
        path as string,
        args[0] as RoutePathOptionsBase | undefined,
      );
      return router.navigateByUrl(url);
    },

    /** Create a UrlTree from a typed route path. */
    createUrlTree<P extends AnalogRoutePath>(
      path: P,
      ...args: RoutePathArgs<P>
    ) {
      const url = buildUrl(
        path as string,
        args[0] as RoutePathOptionsBase | undefined,
      );
      return router.parseUrl(url);
    },

    /** Build a URL string from a typed route path. */
    url<P extends AnalogRoutePath>(path: P, ...args: RoutePathArgs<P>): string {
      return buildUrl(
        path as string,
        args[0] as RoutePathOptionsBase | undefined,
      );
    },

    /** Access the underlying Angular Router. */
    get angularRouter(): Router {
      return router;
    },
  };
}
