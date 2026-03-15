import { InjectionToken } from '@angular/core';
import type { RouterFeatures } from '@angular/router';

/**
 * Configuration for experimental typed router features.
 *
 * Inspired by TanStack Router's type-safe navigation system where
 * routes are registered globally and all navigation/hooks are typed
 * against the route tree.
 *
 * @experimental
 */
export interface TypedRouterOptions {
  /**
   * When true, logs warnings in development when navigating to
   * routes with params that don't match the generated route table.
   *
   * Similar to TanStack Router's strict mode where `useParams()`
   * without a `from` constraint returns a union of all possible params.
   *
   * @default false
   */
  strictRouteParams?: boolean;
}

/**
 * Configuration for experimental loader caching.
 *
 * Inspired by TanStack Router's built-in data caching where route
 * loaders automatically cache results and support stale-while-revalidate.
 *
 * @experimental
 */
export interface LoaderCacheOptions {
  /**
   * Time in milliseconds before loader data is considered stale.
   * While data is fresh, navigating back to the route uses cached
   * data without re-invoking the server load function.
   *
   * Mirrors TanStack Router's `defaultStaleTime` option on `createRouter()`.
   *
   * @default 0 (always re-fetch)
   */
  defaultStaleTime?: number;

  /**
   * Time in milliseconds to retain unused loader data in cache
   * after leaving a route. After this period the cached entry is
   * garbage-collected.
   *
   * Mirrors TanStack Router's `defaultGcTime` (default 30 min).
   *
   * @default 300_000 (5 minutes)
   */
  defaultGcTime?: number;

  /**
   * Delay in milliseconds before showing a pending/loading indicator
   * during route transitions. Prevents flash-of-loading-state for
   * fast navigations.
   *
   * Mirrors TanStack Router's `defaultPendingMs`.
   *
   * @default 0 (show immediately)
   */
  defaultPendingMs?: number;
}

// ---------------------------------------------------------------------------
// DI tokens
// ---------------------------------------------------------------------------

/** @experimental */
export const EXPERIMENTAL_TYPED_ROUTER = new InjectionToken<TypedRouterOptions>(
  'EXPERIMENTAL_TYPED_ROUTER',
);

/** @experimental */
export const EXPERIMENTAL_ROUTE_CONTEXT = new InjectionToken<
  Record<string, unknown>
>('EXPERIMENTAL_ROUTE_CONTEXT');

/** @experimental */
export const EXPERIMENTAL_LOADER_CACHE = new InjectionToken<LoaderCacheOptions>(
  'EXPERIMENTAL_LOADER_CACHE',
);

// ---------------------------------------------------------------------------
// Provider feature functions (passed to provideFileRouter)
// ---------------------------------------------------------------------------

/**
 * Enables experimental typed router features.
 *
 * When active, `injectTypedRouter()`, `routePath()`, `injectTypedParams()`,
 * and `injectTypedQuery()` will enforce route table constraints and
 * optionally log warnings in strict mode.
 *
 * Inspired by TanStack Router's `Register` interface and strict type
 * checking across the entire navigation surface.
 *
 * @example
 * ```ts
 * provideFileRouter(
 *   withTypedRouter({ strictRouteParams: true }),
 * )
 * ```
 *
 * @experimental
 */
export function withTypedRouter(options?: TypedRouterOptions): RouterFeatures {
  return {
    ɵkind: 102 as number,
    ɵproviders: [
      {
        provide: EXPERIMENTAL_TYPED_ROUTER,
        useValue: { strictRouteParams: false, ...options },
      },
    ],
  };
}

/**
 * Provides root-level route context available to all route loaders
 * and components via `injectRouteContext()`.
 *
 * Inspired by TanStack Router's `createRootRouteWithContext<T>()` where
 * a typed context object is required at router creation and automatically
 * available in every route's `beforeLoad` and `loader`.
 *
 * In Angular terms, this creates a DI token that server-side load
 * functions and components can inject to access shared services
 * without importing them individually.
 *
 * @example
 * ```ts
 * // app.config.ts
 * provideFileRouter(
 *   withRouteContext({
 *     auth: inject(AuthService),
 *     db: inject(DatabaseService),
 *   }),
 * )
 *
 * // In a component
 * const ctx = injectRouteContext<{ auth: AuthService; db: DatabaseService }>();
 * ```
 *
 * @experimental
 */
export function withRouteContext<T extends Record<string, unknown>>(
  context: T,
): RouterFeatures {
  return {
    ɵkind: 103 as number,
    ɵproviders: [
      {
        provide: EXPERIMENTAL_ROUTE_CONTEXT,
        useValue: context,
      },
    ],
  };
}

/**
 * Configures experimental loader caching behavior for server-loaded
 * route data.
 *
 * Inspired by TanStack Router's built-in cache where `createRouter()`
 * accepts `defaultStaleTime` and `defaultGcTime` to control when
 * loaders re-execute and when cached data is discarded.
 *
 * @example
 * ```ts
 * provideFileRouter(
 *   withLoaderCaching({
 *     defaultStaleTime: 30_000,  // 30s before re-fetch
 *     defaultGcTime: 300_000,    // 5min cache retention
 *     defaultPendingMs: 200,     // 200ms loading delay
 *   }),
 * )
 * ```
 *
 * @experimental
 */
export function withLoaderCaching(
  options?: LoaderCacheOptions,
): RouterFeatures {
  return {
    ɵkind: 104 as number,
    ɵproviders: [
      {
        provide: EXPERIMENTAL_LOADER_CACHE,
        useValue: {
          defaultStaleTime: 0,
          defaultGcTime: 300_000,
          defaultPendingMs: 0,
          ...options,
        },
      },
    ],
  };
}
