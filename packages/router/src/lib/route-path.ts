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
// eslint-disable-next-line @typescript-eslint/no-empty-interface
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

/**
 * Typed options that infer params from the route table when available.
 */
export type RoutePathOptions<P extends string = string> =
  P extends keyof AnalogRouteTable
    ? AnalogRouteTable[P] extends { params: infer Params }
      ? Params extends Record<string, never>
        ? {
            query?: Record<string, string | string[] | undefined>;
            hash?: string;
          }
        : {
            params: Params;
            query?: Record<string, string | string[] | undefined>;
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
        : [options: RoutePathOptions<P>]
      : [options?: RoutePathOptionsBase]
    : [options?: RoutePathOptionsBase];

/**
 * Builds a URL string from a route path pattern and options.
 *
 * @example
 * routePath('/about')
 * // → '/about'
 *
 * routePath('/users/[id]', { params: { id: '42' } })
 * // → '/users/42'
 *
 * routePath('/docs/[...slug]', { params: { slug: ['api', 'auth'] } })
 * // → '/docs/api/auth'
 *
 * routePath('/shop/[[...category]]', { params: { category: ['shoes'] } })
 * // → '/shop/shoes'
 *
 * routePath('/shop/[[...category]]')
 * // → '/shop'
 *
 * routePath('/users/[id]', { params: { id: '42' }, query: { tab: 'settings' } })
 * // → '/users/42?tab=settings'
 */
export function routePath<P extends AnalogRoutePath>(
  path: P,
  ...args: RoutePathArgs<P>
): string {
  const options = args[0] as RoutePathOptionsBase | undefined;
  return buildUrl(path as string, options);
}

/**
 * Internal URL builder. Separated from `routePath` so it can be
 * used without generic constraints (e.g., in `injectTypedRouter`).
 */
export function buildUrl(path: string, options?: RoutePathOptionsBase): string {
  let url = path;

  if (options?.params) {
    // Replace [[...param]] — optional catch-all
    url = url.replace(/\[\[\.\.\.([^\]]+)\]\]/g, (_, name) => {
      const value = options.params?.[name];
      if (value == null) return '';
      if (Array.isArray(value)) {
        return value.map((v) => encodeURIComponent(v)).join('/');
      }
      return encodeURIComponent(String(value));
    });

    // Replace [...param] — required catch-all
    url = url.replace(/\[\.\.\.([^\]]+)\]/g, (_, name) => {
      const value = options.params?.[name];
      if (value == null) return '';
      if (Array.isArray(value)) {
        return value.map((v) => encodeURIComponent(v)).join('/');
      }
      return encodeURIComponent(String(value));
    });

    // Replace [param] — dynamic param
    url = url.replace(/\[([^\]]+)\]/g, (_, name) => {
      const value = options.params?.[name];
      return value != null ? encodeURIComponent(String(value)) : '';
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

  // Add query params
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

  // Add hash
  if (options?.hash) {
    url += '#' + options.hash;
  }

  return url;
}
