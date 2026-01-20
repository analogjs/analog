/**
 * Type-safe route parameter injection.
 *
 * Provides a Signal-based API for consuming route parameters with full type safety.
 */

import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/**
 * Registry interface for resolved route parameters.
 * This interface is augmented by the generated routes.d.ts file.
 *
 * @example
 * // In routes.d.ts (auto-generated):
 * declare module '@analogjs/router' {
 *   interface ResolvedRouteParams {
 *     '/products/[productId]': { productId: string };
 *   }
 * }
 */
export interface ResolvedRouteParams {}

/**
 * Dynamic routes are routes that have parameters.
 * This type is derived from the ResolvedRouteParams interface.
 * When no routes are registered, this is `never`.
 */
export type DynamicRoutes = keyof ResolvedRouteParams;

/**
 * Placeholder type for resolved route parameters (for fallback typing).
 * This type requires routes.d.ts to be generated for actual type safety.
 */
export type TypedParams = Record<string, string>;

/** Supported type constructors for schema-based type override */
export type TypeConstructor =
  | NumberConstructor
  | BooleanConstructor
  | StringConstructor;

/** Infer the TypeScript type from a constructor */
export type InferConstructor<T> = T extends NumberConstructor
  ? number
  : T extends BooleanConstructor
    ? boolean
    : T extends StringConstructor
      ? string
      : never;

/** Schema using type constructors to override parameter types */
export type ParamSchema<Params extends Record<string, string>> = {
  [K in keyof Params]?: TypeConstructor;
};

/**
 * StandardSchema v1 compatible interface for type inference.
 * Works with Zod 4+, Valibot 1+, ArkType, and any StandardSchema-compliant library.
 * @see https://standardschema.dev
 */
export type SchemaLike<T> = {
  readonly '~standard': {
    readonly types?: { readonly output: T };
  };
};

/** Infer the output type from a StandardSchema */
export type InferSchemaOutput<S> = S extends {
  readonly '~standard': { readonly types?: { readonly output: infer T } };
}
  ? T
  : never;

/** Infer parameter types from a constructor-based schema applied to route params */
export type InferredParams<
  Params extends Record<string, string>,
  Schema extends ParamSchema<Params>,
> = {
  [K in keyof Params]: K extends keyof Schema
    ? Schema[K] extends TypeConstructor
      ? InferConstructor<Schema[K]>
      : string
    : string;
};

/**
 * Helper type: Get route params if T is a registered route, otherwise generic params.
 * Uses conditional type to check if T is a key of ResolvedRouteParams at usage site.
 */
export type GetRouteParams<T> = T extends keyof ResolvedRouteParams
  ? ResolvedRouteParams[T]
  : TypedParams;

/**
 * Helper type: Apply schema transformations to route params.
 * If S is undefined, return raw params.
 * If S is a SchemaLike, use StandardSchema inference.
 * If S is a constructor schema, transform the param types.
 * Otherwise, return raw params.
 */
export type ApplySchema<
  Params extends Record<string, string>,
  S,
> = S extends undefined
  ? Params
  : S extends SchemaLike<unknown>
    ? InferSchemaOutput<S>
    : S extends Record<string, TypeConstructor>
      ? {
          [K in keyof Params]: K extends keyof S
            ? S[K] extends TypeConstructor
              ? InferConstructor<S[K]>
              : string
            : string;
        }
      : Params;

/**
 * The return type of injectParams.
 * Combines route lookup with schema application.
 */
export type InjectParamsReturn<T, S> = ApplySchema<GetRouteParams<T>, S>;

/**
 * Injects typed route parameters as a Signal.
 *
 * Pass the route path as the first argument to get fully typed parameters.
 * The returned Signal updates reactively when route parameters change.
 *
 * **Important**: This function requires `routes.d.ts` to be generated for
 * full type safety. Run `npm run dev` or `npm run build` to generate it.
 *
 * @param _route - The route path (used for type inference, ignored at runtime)
 * @param schema - Optional schema to override parameter types. Can be:
 *   - An object with type constructors: `{ productId: Number }`
 *   - A Zod schema: `z.object({ productId: z.number() })`
 *   - Any StandardSchema-compatible schema (Valibot, ArkType, etc.)
 *
 * @example
 * // In a page component: /products/[productId].page.ts
 * @Component({
 *   template: `<h1>Product {{ params().productId }}</h1>`
 * })
 * export default class ProductPage {
 *   // Without schema - params are strings
 *   params = injectParams('/products/[productId]');
 *   // Type: Signal<{ productId: string }>
 * }
 *
 * @example
 * // Override parameter types with constructors
 * @Component({...})
 * export default class ProductPage {
 *   params = injectParams('/products/[productId]', { productId: Number });
 *   // Type: Signal<{ productId: number }>
 * }
 *
 * @example
 * // Override with Zod schema (works with Zod 3.x and 4+)
 * import { z } from 'zod';
 * @Component({...})
 * export default class ProductPage {
 *   params = injectParams('/products/[productId]',
 *     z.object({ productId: z.coerce.number() })
 *   );
 *   // Type: Signal<{ productId: number }>
 * }
 *
 * @returns Signal containing the typed route parameters
 */
// Overload 1: With constructor schema
export function injectParams<
  T extends DynamicRoutes,
  S extends Record<string, TypeConstructor>,
>(route: T, schema: S): Signal<InjectParamsReturn<T, S>>;

// Overload 2: With StandardSchema
export function injectParams<
  T extends DynamicRoutes,
  S extends SchemaLike<unknown>,
>(route: T, schema: S): Signal<InferSchemaOutput<S>>;

// Overload 3: Without schema
export function injectParams<T extends DynamicRoutes>(
  route: T,
): Signal<GetRouteParams<T>>;

// Overload 4: Fallback for untyped routes (when routes.d.ts not generated)
export function injectParams<T extends string>(route?: T): Signal<TypedParams>;

// Implementation
export function injectParams<
  T extends string,
  S extends Record<string, TypeConstructor> | SchemaLike<unknown> | undefined,
>(_route?: T, _schema?: S): Signal<InjectParamsReturn<T, S> | TypedParams> {
  const activatedRoute = inject(ActivatedRoute);

  return toSignal(
    activatedRoute.paramMap.pipe(
      map((paramMap) => {
        const params: Record<string, string> = {};
        for (const key of paramMap.keys) {
          params[key] = paramMap.get(key) ?? '';
        }
        return params;
      }),
    ),
    { requireSync: true },
  ) as Signal<InjectParamsReturn<T, S> | TypedParams>;
}
