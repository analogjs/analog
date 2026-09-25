import {
  DefaultUrlSerializer,
  PRIMARY_OUTLET,
  type ResolveFn,
  type ResourceResult,
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

type QueryValue = string | number | boolean;

/**
 * Query values accepted when building URLs. Angular converts them to strings
 * and drops `null` and `undefined`, or removes those keys when merging.
 */
type RouteQueryInput = Record<
  string,
  QueryValue | QueryValue[] | null | undefined
>;

/**
 * Options for building a route URL.
 */
export interface RoutePathOptionsBase {
  params?: Record<string, string | number | (string | number)[] | undefined>;
  query?: RouteQueryInput;
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
            query?: RouteQueryInput;
            hash?: string;
          }
        : HasRequiredRouteParams<Params> extends true
          ? {
              params: RouteParamsInput<Params>;
              query?: RouteQueryInput;
              hash?: string;
            }
          : {
              params?: RouteParamsInput<Params>;
              query?: RouteQueryInput;
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

type EmptyObject = Record<never, never>;
type Simplify<T> = { [K in keyof T]: T[K] };
type Merge<A, B> = Omit<A, keyof B> & B;

// Annotating `routeMeta` as `RouteMeta` widens these objects to index signatures.
type MetaObject<T> = unknown extends T
  ? EmptyObject
  : string extends keyof NonNullable<T>
    ? Record<string, unknown>
    : NonNullable<T>;

type StaticRouteData<Meta> = Meta extends { data?: infer Data }
  ? MetaObject<Data>
  : EmptyObject;

type RouteResolvers<Meta> = Meta extends { resolve?: infer Resolvers }
  ? MetaObject<Resolvers>
  : EmptyObject;

type ResolvedRouteData<Meta> = {
  [K in keyof RouteResolvers<Meta>]: RouteResolvers<Meta>[K] extends ResolveFn<
    infer T
  >
    ? T
    : unknown;
};

type RouteMetaData<Meta> = Merge<
  StaticRouteData<Meta>,
  ResolvedRouteData<Meta>
>;

// Routes inherit parent data; child keys override parent keys.
type InheritedRouteData<Metas, Data = EmptyObject> = Metas extends [
  infer Meta,
  ...infer Rest,
]
  ? InheritedRouteData<
      Rest,
      Merge<Data, RouteMetaData<Exclude<Meta, { redirectTo: string }>>>
    >
  : Data;

type RouteResourceMap<Meta> = Meta extends {
  resources?: (ctx: never) => infer R;
}
  ? Awaited<R> extends Record<PropertyKey, unknown>
    ? Awaited<R>
    : EmptyObject
  : EmptyObject;

type PageRouteMetas<P extends keyof AnalogRouteTable> = [
  ...(AnalogRouteTable[P] extends {
    layoutRouteMeta: infer Metas extends unknown[];
  }
    ? Metas
    : []),
  ...(AnalogRouteTable[P] extends { routeMeta: infer Meta } ? [Meta] : []),
];

type PageLoadData<P extends keyof AnalogRouteTable> =
  AnalogRouteTable[P] extends { load: unknown }
    ? { load: RouteLoadOutput<P> }
    : EmptyObject;

/** Route paths whose page has a server `load` function. */
export type AnalogRouteWithLoad = {
  [P in AnalogRoutePath]: AnalogRouteTable[P] extends { load: unknown }
    ? P
    : never;
}[AnalogRoutePath];

/** Resolved result of a page's server `load` function. */
export type RouteLoadOutput<P extends string> = P extends keyof AnalogRouteTable
  ? AnalogRouteTable[P] extends { load: (...args: never[]) => infer R }
    ? Awaited<R>
    : never
  : never;

/**
 * Data for a page route: static `routeMeta.data` and `routeMeta.resolve`
 * results from its layouts and the page, and the page's server `load` result.
 */
export type RouteDataOutput<P extends string> = P extends keyof AnalogRouteTable
  ? Simplify<
      Omit<InheritedRouteData<PageRouteMetas<P>>, 'load'> & PageLoadData<P>
    >
  : Record<string, unknown>;

/**
 * Resources for a page route: `routeMeta.resources` results defined on the page.
 */
export type RouteResourcesOutput<P extends string> =
  P extends keyof AnalogRouteTable
    ? AnalogRouteTable[P] extends { routeMeta: infer Meta }
      ? Simplify<RouteResourceMap<Exclude<Meta, { redirectTo: string }>>>
      : EmptyObject
    : ResourceResult;

type SplitPath<S extends string> = S extends ''
  ? []
  : S extends `${infer Head}/${infer Tail}`
    ? [Head, ...SplitPath<Tail>]
    : [S];
type Segments<P extends string> = P extends `/${infer Rest}`
  ? SplitPath<Rest>
  : SplitPath<P>;
type JoinPath<S extends string[]> = S extends [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? Tail extends []
    ? Head
    : `${Head}/${JoinPath<Tail>}`
  : '';
type Pop<S extends string[]> = S extends [
  ...infer Init extends string[],
  string,
]
  ? Init
  : [];
type ParentPath<P extends string> = `/${JoinPath<Pop<Segments<P>>>}`;
type LastSegment<P extends string> =
  Segments<P> extends [...string[], infer Last extends string] ? Last : never;

type ResolveSegments<
  Base extends string[],
  Parts extends string[],
> = Parts extends [infer Head extends string, ...infer Tail extends string[]]
  ? ResolveSegments<
      Head extends '.' ? Base : Head extends '..' ? Pop<Base> : [...Base, Head],
      Tail
    >
  : Base;

/** Resolves a relative target against the `From` route path. */
export type ResolveRoutePath<
  From extends string,
  To extends string,
> = To extends `/${string}`
  ? To
  : `/${JoinPath<ResolveSegments<Segments<From>, SplitPath<To>>>}`;

type PathPrefix<Base extends string> = Base extends '/' ? '/' : `${Base}/`;

/** Route paths nested below `Base`, relative to it. */
type ChildPaths<
  Base extends string,
  P extends string = AnalogRoutePath,
> = P extends `${PathPrefix<Base>}${infer Rest}`
  ? Rest extends ''
    ? never
    : Rest
  : never;

// Each target is reachable through its nearest shared ancestor only.
type AncestorTargets<From extends string, Up extends string> = From extends '/'
  ? never
  :
      | (ParentPath<From> extends AnalogRoutePath ? Up : never)
      | `${Up}/${Exclude<
          ChildPaths<ParentPath<From>>,
          LastSegment<From> | `${LastSegment<From>}/${string}`
        >}`
      | AncestorTargets<ParentPath<From>, `${Up}/..`>;

/** Relative targets from `From`: `.`, `./child`, `..`, and `../sibling`. */
export type RelativeRouteTarget<From extends string> =
  | '.'
  | `./${ChildPaths<From>}`
  | AncestorTargets<From, '..'>;

/** Absolute route paths plus targets relative to `From`. */
export type ScopedRouteTarget<From extends string> =
  | AnalogRoutePath
  | RelativeRouteTarget<From>;

type SegmentParam<S extends string> = S extends `[[...${infer Name}]]`
  ? Name
  : S extends `[...${infer Name}]`
    ? Name
    : S extends `[${infer Name}]`
      ? Name
      : never;

// Params in the leading segments shared by both paths, matching Angular's relative navigation.
type SharedParams<A extends string[], B extends string[]> = A extends [
  infer Head extends string,
  ...infer ATail extends string[],
]
  ? B extends [Head, ...infer BTail extends string[]]
    ? SegmentParam<Head> | SharedParams<ATail, BTail>
    : never
  : never;

type WithOptional<T, K extends PropertyKey> = Simplify<
  Omit<T, K> & Partial<Pick<T, Extract<keyof T, K>>>
>;

type ScopedParamsInput<From extends string, To extends string> = WithOptional<
  RouteParamsInput<RouteParamsOutput<To>>,
  SharedParams<Segments<From>, Segments<To>>
>;

/** Options for a route path; params shared with `From` default to current values. */
export type ScopedRoutePathOptions<From extends string, To extends string> =
  RouteParamsOutput<To> extends Record<string, never>
    ? { params?: never; query?: RouteQueryInput; hash?: string }
    : HasRequiredRouteParams<ScopedParamsInput<From, To>> extends true
      ? {
          params: ScopedParamsInput<From, To>;
          query?: RouteQueryInput;
          hash?: string;
        }
      : {
          params?: ScopedParamsInput<From, To>;
          query?: RouteQueryInput;
          hash?: string;
        };

/** Conditional args for a target resolved against `From`. */
export type ScopedRoutePathArgs<From extends string, Target extends string> =
  ScopedRoutePathOptions<From, ResolveRoutePath<From, Target>> extends infer O
    ? EmptyObject extends O
      ? [options?: O]
      : [options: O]
    : never;

/**
 * Result of `toRoute()` — contains properties that map directly
 * to Angular's `[routerLink]`, `[queryParams]`, and `[fragment]` inputs.
 */
export interface RouteLinkResult {
  path: string[];
  queryParams: RouteQueryInput | null;
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
  return {
    path: buildPath(path, options?.params),
    queryParams: options?.query ?? null,
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
  const queryParams = link.queryParams
    ? Object.fromEntries(
        Object.entries(link.queryParams).filter(([, value]) => value != null),
      )
    : {};
  return new DefaultUrlSerializer().serialize(
    new UrlTree(root, queryParams, link.fragment ?? null),
  );
}

/** Internal: resolves `.` and `..` segments in `to` against the `from` route path. */
export function resolveRoutePath(from: string, to: string): string {
  if (to.startsWith('/')) return to;
  const segments = from.split('/').filter(Boolean);
  for (const part of to.split('/')) {
    if (part === '..') {
      segments.pop();
    } else if (part && part !== '.') {
      segments.push(part);
    }
  }
  return '/' + segments.join('/');
}

/**
 * Internal: resolves `target` against the `from` route path. Params in the
 * leading segments shared with `from` default to the `current` values.
 */
export function resolveScopedRoute(
  from: string,
  target: string,
  current: Record<string, unknown>,
  options?: RoutePathOptionsBase,
): { path: string; options: RoutePathOptionsBase } {
  const path = resolveRoutePath(from, target);
  const fromSegments = from.split('/').filter(Boolean);
  const toSegments = path.split('/').filter(Boolean);
  const params: Record<string, unknown> = {};
  for (
    let i = 0;
    i < toSegments.length && toSegments[i] === fromSegments[i];
    i++
  ) {
    const name = paramName(toSegments[i]);
    if (name) params[name] = current[name];
  }
  return {
    path,
    options: {
      ...options,
      params: {
        ...params,
        ...options?.params,
      } as RoutePathOptionsBase['params'],
    },
  };
}

function paramName(segment: string): string | undefined {
  return (segment.match(/^\[\[\.\.\.([^\]]+)\]\]$/) ??
    segment.match(/^\[\.\.\.([^\]]+)\]$/) ??
    segment.match(/^\[([^\]]+)\]$/))?.[1];
}
