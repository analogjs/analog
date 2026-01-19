/**
 * Type-safe route parameter injection.
 *
 * Provides a Signal-based API for consuming route parameters with full type safety.
 */

import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { TypedRoute } from './route-builder';

/**
 * Placeholder type for resolved route parameters.
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

/** Infer parameter types from a constructor-based schema */
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
 * Injects typed route parameters as a Signal.
 *
 * Use the route path as a type parameter to get fully typed parameters.
 * The returned Signal updates reactively when route parameters change.
 *
 * **Important**: This function requires `routes.d.ts` to be generated for
 * type safety. Run `npm run dev` or `npm run build` to generate it.
 *
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
 *   params = injectParams<'/products/[productId]'>();
 *   // Type: Signal<{ productId: string }>
 * }
 *
 * @example
 * // Override parameter types with constructors
 * @Component({...})
 * export default class ProductPage {
 *   params = injectParams<'/products/[productId]'>({ productId: Number });
 *   // Type: Signal<{ productId: number }>
 * }
 *
 * @example
 * // Override with Zod schema (works with Zod 3.x and 4+)
 * import { z } from 'zod';
 * @Component({...})
 * export default class ProductPage {
 *   params = injectParams<'/products/[productId]'>(
 *     z.object({ productId: z.coerce.number() })
 *   );
 *   // Type: Signal<{ productId: number }>
 * }
 *
 * @returns Signal containing the typed route parameters
 */
export function injectParams<
  T extends TypedRoute,
  S extends ParamSchema<TypedParams> | SchemaLike<unknown> = Record<
    string,
    never
  >,
>(
  schema?: S,
): Signal<
  S extends SchemaLike<unknown>
    ? InferSchemaOutput<S>
    : S extends ParamSchema<TypedParams>
      ? InferredParams<TypedParams, S>
      : TypedParams
> {
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
  ) as Signal<
    S extends SchemaLike<unknown>
      ? InferSchemaOutput<S>
      : S extends ParamSchema<TypedParams>
        ? InferredParams<TypedParams, S>
        : TypedParams
  >;
}
