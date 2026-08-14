/**
 * Typed route path utilities for Analog.
 *
 * This module provides:
 * - The `AnalogRouteTable` base interface (augmented by generated code)
 * - The `AnalogRoutePath` union type
 * - The `routePath()` URL builder function
 *
 * No Angular dependencies — can be used in any context.
 */

/**
 * Base interface for the typed route table.
 *
 * This interface is augmented by generated code in `src/routeTree.gen.ts`.
 * When no routes are generated, it is empty and `AnalogRoutePath` falls
 * back to `string`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
export interface AnalogRouteTable {}

/**
 * Union of all valid route paths.
 *
 * When routes are generated, this is a string literal union.
 * When no routes are generated, this falls back to `string`.
 */
export type AnalogRoutePath = keyof AnalogRouteTable extends never
  ? string
  : Extract<keyof AnalogRouteTable, string>;

/**
 * Options for building a route URL.
 */
export interface RoutePathOptionsBase {
  params?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  hash?: string;
}

/**
 * Extracts the validated output type for route params.
 *
 * When a route exports `routeParamsSchema`, this resolves to the schema's
 * output type (e.g., `{ id: number }` after coercion).
 * When no schema exists, this is the same as the navigation param type.
 */
export type RouteParamsOutput<P extends string> =
  P extends keyof AnalogRouteTable
    ? AnalogRouteTable[P] extends { paramsOutput: infer O }
      ? O
      : AnalogRouteTable[P] extends { params: infer Params }
        ? Params
        : Record<string, unknown>
    : Record<string, unknown>;

/**
 * Extracts the validated output type for route query params.
 */
export type RouteQueryOutput<P extends string> =
  P extends keyof AnalogRouteTable
    ? AnalogRouteTable[P] extends { queryOutput: infer O }
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

/**
 * Typed options that infer params from the route table when available.
 */
export type RoutePathOptions<P extends string = string> =
  P extends keyof AnalogRouteTable
    ? AnalogRouteTable[P] extends { params: infer Params }
      ? Params extends Record<string, never>
        ? {
            query?: RouteQueryOutput<P>;
            hash?: string;
          }
        : HasRequiredRouteParams<Params> extends true
          ? {
              params: Params;
              query?: RouteQueryOutput<P>;
              hash?: string;
            }
          : {
              params?: Params;
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
 * Result of `routePath()` — contains properties that map directly
 * to Angular's `[routerLink]`, `[queryParams]`, and `[fragment]` inputs.
 */
export interface RouteLinkResult {
  path: string;
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
 * routePath('/about')
 * // → { path: '/about', queryParams: null, fragment: undefined }
 *
 * routePath('/users/[id]', { params: { id: '42' } })
 * // → { path: '/users/42', queryParams: null, fragment: undefined }
 *
 * routePath('/users/[id]', { params: { id: '42' }, query: { tab: 'settings' }, hash: 'bio' })
 * // → { path: '/users/42', queryParams: { tab: 'settings' }, fragment: 'bio' }
 *
 * @example Template usage
 * ```html
 * @let link = routePath('/users/[id]', { params: { id: userId } });
 * <a [routerLink]="link.path" [queryParams]="link.queryParams" [fragment]="link.fragment">
 * ```
 */
export function routePath<P extends AnalogRoutePath>(
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

/**
 * Resolves param placeholders and normalises slashes.
 * Returns only the path — no query string or hash.
 */
function buildPath(
  path: string,
  params?: Record<string, string | string[] | undefined>,
): string {
  let url = path;

  if (params) {
    // Replace [[...param]] — optional catch-all
    url = url.replace(/\[\[\.\.\.([^\]]+)\]\]/g, (_, name) => {
      const value = params[name];
      if (value == null) return '';
      if (Array.isArray(value)) {
        return value.map((v) => encodeURIComponent(v)).join('/');
      }
      return encodeURIComponent(String(value));
    });

    // Replace [...param] — required catch-all
    url = url.replace(/\[\.\.\.([^\]]+)\]/g, (_, name) => {
      const value = params[name];
      if (value == null) {
        throw new Error(
          `Missing required catch-all param "${name}" for path "${path}"`,
        );
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          throw new Error(
            `Missing required catch-all param "${name}" for path "${path}"`,
          );
        }
        return value.map((v) => encodeURIComponent(v)).join('/');
      }
      return encodeURIComponent(String(value));
    });

    // Replace [param] — dynamic param
    url = url.replace(/\[([^\]]+)\]/g, (_, name) => {
      const value = params[name];
      if (value == null) {
        throw new Error(`Missing required param "${name}" for path "${path}"`);
      }
      return encodeURIComponent(String(value));
    });
  } else {
    // Strip bracket syntax when no params provided
    url = url.replace(/\[\[\.\.\.([^\]]+)\]\]/g, '');
    url = url.replace(/\[\.\.\.([^\]]+)\]/g, '');
    url = url.replace(/\[([^\]]+)\]/g, '');
  }

  // Clean up double/trailing slashes
  url = url.replace(/\/+/g, '/');
  if (url.length > 1 && url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  if (!url.startsWith('/')) {
    url = '/' + url;
  }

  return url;
}

/**
 * Internal URL builder. Separated from `routePath` so it can be
 * used without generic constraints (e.g., in `injectNavigate`).
 */
export function buildUrl(path: string, options?: RoutePathOptionsBase): string {
  let url = buildPath(path, options?.params);

  if (options?.query) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
        }
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }
    if (parts.length > 0) {
      url += '?' + parts.join('&');
    }
  }

  if (options?.hash) {
    url += '#' + options.hash;
  }

  return url;
}
