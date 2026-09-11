import {
  DefaultUrlSerializer,
  PRIMARY_OUTLET,
  UrlSegment,
  UrlSegmentGroup,
  UrlTree,
} from '@angular/router';

/**
 * Typed route path utilities for Analog.
 *
 * This module provides:
 * - The `AnalogRouteTable` base interface (augmented by generated code)
 * - The `AnalogRoutePath` union type
 * - The `toRoute()` URL builder function
 *
 * Link construction does not require an injection context.
 */

/**
 * Base interface for the typed route table.
 *
 * This interface is augmented by generated code in `src/routeTree.gen.d.ts`.
 * Without the generated declaration, typed helpers reject route paths.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
export interface AnalogRouteTable {}

/**
 * Union of all valid route paths.
 *
 * When routes are generated, this is a string literal union.
 * Without the generated declaration, this is `never`.
 */
export type AnalogRoutePath = Extract<keyof AnalogRouteTable, string>;

/**
 * Options for building a route URL.
 */
export interface RoutePathOptionsBase {
  params?: Record<string, string | number | (string | number)[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  hash?: string;
}

/** Raw parameter types from the generated route table. */
export type RouteParamsOutput<P extends string> =
  P extends keyof AnalogRouteTable
    ? AnalogRouteTable[P] extends { params: infer Params }
      ? Params
      : Record<string, unknown>
    : Record<string, unknown>;

/**
 * Extracts the raw output type for route query params.
 */
export type RouteQueryOutput<P extends string> =
  P extends keyof AnalogRouteTable
    ? AnalogRouteTable[P] extends { query: infer O }
      ? O
      : Record<string, string | string[] | undefined>
    : Record<string, string | string[] | undefined>;

type RequiredRouteParamKeys<Params> =
  Params extends Record<string, never>
    ? never
    : {
        [K in keyof Params]-?: Record<string, never> extends Pick<Params, K>
          ? never
          : K;
      }[keyof Params];

type HasRequiredRouteParams<Params> = [RequiredRouteParamKeys<Params>] extends [
  never,
]
  ? false
  : true;

type RouteParamsInput<Params> = {
  [K in keyof Params]: Exclude<Params[K], undefined> extends string[]
    ? undefined extends Params[K]
      ? (string | number)[]
      : [string | number, ...(string | number)[]]
    : Exclude<Params[K], undefined> extends string
      ? string | number
      : Params[K];
};

/**
 * Typed options that infer params from the route table when available.
 */
export type RoutePathOptions<P extends string = string> =
  P extends keyof AnalogRouteTable
    ? AnalogRouteTable[P] extends { params: infer Params }
      ? Params extends Record<string, never>
        ? {
            params?: never;
            query?: RouteQueryOutput<P>;
            hash?: string;
          }
        : HasRequiredRouteParams<Params> extends true
          ? {
              params: RouteParamsInput<Params>;
              query?: RouteQueryOutput<P>;
              hash?: string;
            }
          : {
              params?: RouteParamsInput<Params>;
              query?: RouteQueryOutput<P>;
              hash?: string;
            }
      : RoutePathOptionsBase
    : RoutePathOptionsBase;

/**
 * Conditional args: require options when the route has params.
 */
export type RoutePathArgs<P extends string = string> =
  P extends keyof AnalogRouteTable
    ? AnalogRouteTable[P] extends { params: infer Params }
      ? Params extends Record<string, never>
        ? [options?: RoutePathOptions<P>]
        : HasRequiredRouteParams<Params> extends true
          ? [options: RoutePathOptions<P>]
          : [options?: RoutePathOptions<P>]
      : [options?: RoutePathOptionsBase]
    : [options?: RoutePathOptionsBase];

/**
 * Result of `toRoute()` — contains properties that map directly
 * to Angular's `[routerLink]`, `[queryParams]`, and `[fragment]` inputs.
 */
export interface RouteLinkResult {
  path: string[];
  queryParams: Record<string, string | string[]> | null;
  fragment: string | undefined;
}

/**
 * Builds a typed route link object from a route path pattern and options.
 *
 * The returned object separates path, query params, and fragment for
 * direct use with Angular's routerLink directive inputs.
 *
 * @example
 * toRoute('/about')
 * // → { path: ['/', 'about'], queryParams: null, fragment: undefined }
 *
 * toRoute('/users/[id]', { params: { id: '42' } })
 * // → { path: ['/', 'users', '42'], queryParams: null, fragment: undefined }
 *
 * toRoute('/users/[id]', { params: { id: '42' }, query: { tab: 'settings' }, hash: 'bio' })
 * // → { path: ['/', 'users', '42'], queryParams: { tab: 'settings' }, fragment: 'bio' }
 *
 * @example Template usage
 * Compute the link in the component:
 * ```ts
 * readonly link = toRoute('/users/[id]', { params: { id: '42' } });
 * ```
 *
 * ```html
 * <a [routerLink]="link.path" [queryParams]="link.queryParams" [fragment]="link.fragment">
 * ```
 */
export function toRoute<P extends AnalogRoutePath>(
  path: P,
  ...args: RoutePathArgs<P>
): RouteLinkResult {
  const options = args[0] as RoutePathOptionsBase | undefined;
  return buildRouteLink(path as string, options);
}

/**
 * Internal: builds a `RouteLinkResult` from path and options.
 * Exported for direct use in tests (avoids generic constraints).
 */
export function buildRouteLink(
  path: string,
  options?: RoutePathOptionsBase,
): RouteLinkResult {
  const resolvedPath = buildPath(path, options?.params);

  let queryParams: Record<string, string | string[]> | null = null;
  if (options?.query) {
    const filtered: Record<string, string | string[]> = {};
    let hasEntries = false;
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        filtered[key] = value;
        hasEntries = true;
      }
    }
    if (hasEntries) {
      queryParams = filtered;
    }
  }

  return {
    path: resolvedPath,
    queryParams,
    fragment: options?.hash,
  };
}

function buildPath(
  path: string,
  params: RoutePathOptionsBase['params'] = {},
): string[] {
  const segments = path
    .split('/')
    .filter(Boolean)
    .flatMap((segment) => {
      const optional = segment.match(/^\[\[\.\.\.([^\]]+)\]\]$/);
      const catchAll = segment.match(/^\[\.\.\.([^\]]+)\]$/);
      const dynamic = segment.match(/^\[([^\]]+)\]$/);
      const match = optional ?? catchAll ?? dynamic;
      if (!match) return [segment];
      const value = params[match[1]];
      if (value == null || (Array.isArray(value) && !value.length)) {
        if (optional) return [];
        throw new Error(
          `Missing required ${catchAll ? 'catch-all ' : ''}param "${match[1]}" for path "${path}"`,
        );
      }
      return Array.isArray(value) ? value.map(String) : [String(value)];
    });
  // A separate root command keeps slashes inside parameter values in one segment.
  return ['/', ...segments];
}

/** Internal URL serialization for programmatic navigation. */
export function buildUrl(path: string, options?: RoutePathOptionsBase): string {
  const link = buildRouteLink(path, options);
  const segments = link.path.slice(1).map((path) => new UrlSegment(path, {}));
  const root = new UrlSegmentGroup([], {
    [PRIMARY_OUTLET]: new UrlSegmentGroup(segments, {}),
  });
  return new DefaultUrlSerializer().serialize(
    new UrlTree(root, link.queryParams ?? {}, link.fragment ?? null),
  );
}
