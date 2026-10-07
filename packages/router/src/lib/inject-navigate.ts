import { inject, Injector } from '@angular/core';
import {
  type NavigationBehaviorOptions,
  Router,
  type UrlCreationOptions,
} from '@angular/router';

import { injectParams, injectQuery } from './inject-typed-params';
import type {
  AnalogRoutePath,
  ResolveRoutePath,
  RouteParamsOutput,
  RoutePathArgs,
  RoutePathOptionsBase,
  RouteQueryOutput,
  ScopedRoutePathOptions,
  ScopedRouteTarget,
} from './to-route';
import { buildRouteLink, resolveScopedRoute } from './to-route';

/** Angular navigation extras; `query` and `hash` replace `queryParams` and `fragment`. */
type NavigateExtras = NavigationBehaviorOptions &
  Pick<UrlCreationOptions, 'queryParamsHandling' | 'preserveFragment'>;

type WithExtrasArgs<Args extends [options?: unknown]> = [] extends Args
  ?
      | [extras: NavigateExtras]
      | [options: Args[0] | undefined, extras: NavigateExtras]
  : [options: Args[0], extras: NavigateExtras];

type TypedNavigate = {
  <P extends AnalogRoutePath>(
    path: P,
    ...args: RoutePathArgs<P>
  ): Promise<boolean>;
  <P extends AnalogRoutePath>(
    path: P,
    ...args: WithExtrasArgs<RoutePathArgs<P>>
  ): Promise<boolean>;
};

// `params` and `query` may also be computed from the current route's values.
type WithUpdaters<From extends string, O> = {
  [K in keyof O]: K extends 'params'
    ? O[K] | ((prev: RouteParamsOutput<From>) => Exclude<O[K], undefined>)
    : K extends 'query'
      ? O[K] | ((prev: RouteQueryOutput<From>) => Exclude<O[K], undefined>)
      : O[K];
};

type ScopedNavigateArgs<From extends string, T extends string> =
  WithUpdaters<
    From,
    ScopedRoutePathOptions<From, ResolveRoutePath<From, T>>
  > extends infer O
    ? Record<never, never> extends O
      ? [options?: O]
      : [options: O]
    : never;

type ScopedNavigate<From extends AnalogRoutePath> = {
  <T extends ScopedRouteTarget<From>>(
    target: T,
    ...args: ScopedNavigateArgs<From, T>
  ): Promise<boolean>;
  <T extends ScopedRouteTarget<From>>(
    target: T,
    ...args: WithExtrasArgs<ScopedNavigateArgs<From, T>>
  ): Promise<boolean>;
};

function isRoutePathOptionsBase(value: unknown): value is RoutePathOptionsBase {
  return (
    !!value &&
    typeof value === 'object' &&
    ('params' in value || 'query' in value || 'hash' in value)
  );
}

function update<T>(value: T, current: unknown): T {
  return typeof value === 'function' ? value(current) : value;
}

/**
 * Injects a typed navigate function.
 *
 * @example
 * ```ts
 * const navigate = injectNavigate();
 *
 * navigate('/users/[id]', { params: { id: '42' } });   // ✅
 * navigate('/users/[id]', { params: { id: 42 } });     // ✅
 *
 * // With navigation extras
 * navigate('/users/[id]', { params: { id: '42' } }, { replaceUrl: true });
 * navigate('/search', { query: { page: 2 } }, { queryParamsHandling: 'merge' });
 * ```
 */
export function injectNavigate(): TypedNavigate;
/**
 * Injects a navigate function scoped to the current route, `from`.
 *
 * Targets may be relative (`.`, `./child`, `..`, `../sibling`). Params in the
 * leading segments the target shares with `from` default to current values.
 * `params` and `query` may be functions of the current values.
 *
 * @example
 * ```ts
 * // In the component for /users/[id]
 * const navigate = injectNavigate('/users/[id]');
 *
 * navigate('./posts');                       // /users/42/posts
 * navigate('.', { params: { id: 43 } });     // /users/43
 * navigate('..');                            // /users
 * navigate('.', { params: (prev) => ({ id: Number(prev.id) + 1 }) });
 * ```
 */
export function injectNavigate<From extends AnalogRoutePath>(
  from: From,
  options?: { injector?: Injector },
): ScopedNavigate<From>;
export function injectNavigate(
  from?: string,
  options?: { injector?: Injector },
): (target: string, ...args: unknown[]) => Promise<boolean> {
  const injector = options?.injector ?? inject(Injector);
  const router = injector.get(Router);
  const currentParams = from
    ? injectParams(from as AnalogRoutePath, { injector })
    : undefined;
  const currentQuery = from
    ? injectQuery(from as AnalogRoutePath, { injector })
    : undefined;

  return (target: string, ...args: unknown[]): Promise<boolean> => {
    let options: RoutePathOptionsBase | undefined;
    let extras: NavigateExtras | undefined;

    if (args.length > 1) {
      options = args[0] as RoutePathOptionsBase | undefined;
      extras = args[1] as NavigateExtras | undefined;
    } else if (args.length === 1) {
      if (isRoutePathOptionsBase(args[0])) {
        options = args[0];
      } else {
        extras = args[0] as NavigateExtras;
      }
    }

    let path = target;
    if (from && currentParams && currentQuery) {
      const params = currentParams();
      ({ path, options } = resolveScopedRoute(from, target, params, {
        ...options,
        params: update(options?.params, params),
        query: update(options?.query, currentQuery()),
      }));
    }
    const link = buildRouteLink(path, options);
    return router.navigate(link.path, {
      ...extras,
      queryParams: link.queryParams,
      fragment: link.fragment,
    });
  };
}
