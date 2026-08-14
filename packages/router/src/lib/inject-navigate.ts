import { inject } from '@angular/core';
import { type NavigationBehaviorOptions, Router } from '@angular/router';

import type {
  AnalogRoutePath,
  RoutePathArgs,
  RoutePathOptionsBase,
} from './route-path';
import { buildUrl } from './route-path';

type NavigateWithExtrasArgs<P extends AnalogRoutePath> =
  RoutePathArgs<P> extends [options?: infer Options]
    ?
        | [extras: NavigationBehaviorOptions]
        | [options: Options | undefined, extras: NavigationBehaviorOptions]
    : [options: RoutePathArgs<P>[0], extras: NavigationBehaviorOptions];

type TypedNavigate = {
  <P extends AnalogRoutePath>(
    path: P,
    ...args: RoutePathArgs<P>
  ): Promise<boolean>;
  <P extends AnalogRoutePath>(
    path: P,
    ...args: NavigateWithExtrasArgs<P>
  ): Promise<boolean>;
};

function isRoutePathOptionsBase(value: unknown): value is RoutePathOptionsBase {
  return (
    !!value &&
    typeof value === 'object' &&
    ('params' in value || 'query' in value || 'hash' in value)
  );
}

/**
 * Injects a typed navigate function.
 *
 * @example
 * ```ts
 * const navigate = injectNavigate();
 *
 * navigate('/users/[id]', { params: { id: '42' } });   // ✅
 * navigate('/users/[id]', { params: { id: 42 } });     // ❌ type error
 *
 * // With navigation extras
 * navigate('/users/[id]', { params: { id: '42' } }, { replaceUrl: true });
 * ```
 */
export function injectNavigate(): TypedNavigate {
  const router = inject(Router);

  const navigate = ((
    path: AnalogRoutePath,
    ...args: unknown[]
  ): Promise<boolean> => {
    let options: RoutePathOptionsBase | undefined;
    let extras: NavigationBehaviorOptions | undefined;

    if (args.length > 1) {
      options = args[0] as RoutePathOptionsBase | undefined;
      extras = args[1] as NavigationBehaviorOptions | undefined;
    } else if (args.length === 1) {
      if (isRoutePathOptionsBase(args[0])) {
        options = args[0];
      } else {
        extras = args[0] as NavigationBehaviorOptions;
      }
    }

    const url = buildUrl(path as string, options);
    return router.navigateByUrl(url, extras);
  }) as TypedNavigate;

  return navigate;
}
