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

/**
 * Full StandardSchema v1 interface with validate function for runtime transformation.
 * @see https://standardschema.dev
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: { readonly input: Input; readonly output: Output };
    readonly validate: (
      value: unknown,
    ) =>
      | StandardSchemaV1.SuccessResult<Output>
      | StandardSchemaV1.FailureResult
      | Promise<
          | StandardSchemaV1.SuccessResult<Output>
          | StandardSchemaV1.FailureResult
        >;
  };
}

export declare namespace StandardSchemaV1 {
  /** The result interface if validation succeeds. */
  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  /** The result interface if validation fails. */
  export interface FailureResult {
    readonly issues: ReadonlyArray<{ readonly message: string }>;
  }
}

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

// ============================================================================
// Schema Detection and Transformation Helpers
// ============================================================================

/**
 * Type guard to check if a schema is a StandardSchema v1 with validate function.
 */
function isStandardSchema(schema: unknown): schema is StandardSchemaV1 {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '~standard' in schema &&
    typeof (schema as StandardSchemaV1)['~standard']?.validate === 'function'
  );
}

/**
 * Type guard to check if a schema is a constructor-based schema.
 */
function isConstructorSchema(
  schema: unknown,
): schema is Record<string, TypeConstructor> {
  if (typeof schema !== 'object' || schema === null) return false;
  if ('~standard' in schema) return false; // It's a StandardSchema
  return Object.values(schema).every(
    (v) => v === String || v === Number || v === Boolean,
  );
}

/**
 * Coerces a string value to a boolean using lenient rules.
 * - 'false', '0', '' → false
 * - All other non-empty strings → true
 */
function coerceBoolean(value: string): boolean {
  return value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

/**
 * Transforms params using a constructor-based schema.
 * Applies Number(), Boolean (lenient), or String() constructors to each param.
 */
function transformWithConstructors(
  params: Record<string, string>,
  schema: Record<string, TypeConstructor>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...params };

  for (const [key, constructor] of Object.entries(schema)) {
    if (!(key in params)) continue;
    const value = params[key];

    if (constructor === Number) {
      result[key] = Number(value); // Returns NaN for invalid input
    } else if (constructor === Boolean) {
      result[key] = coerceBoolean(value);
    } else if (constructor === String) {
      result[key] = value; // Already a string
    }
  }

  return result;
}

/**
 * Transforms params using a StandardSchema v1 schema.
 * Calls the schema's validate function and returns the transformed value.
 * On validation failure or async validation, logs a warning and returns raw params.
 */
function transformWithStandardSchema<T>(
  params: Record<string, string>,
  schema: StandardSchemaV1<unknown, T>,
): T | Record<string, string> {
  const result = schema['~standard'].validate(params);

  // Handle async - signals must be synchronous
  if (result instanceof Promise) {
    console.warn(
      '[Analog] injectParams: async schema validation is not supported, returning raw params',
    );
    return params;
  }

  // Handle validation failure - return raw params
  if (result.issues) {
    const messages = result.issues.map((i) => i.message).join(', ');
    console.warn(
      `[Analog] injectParams: schema validation failed: ${messages}`,
    );
    return params;
  }

  return result.value;
}

/**
 * Injects typed route parameters as a Signal with optional runtime transformation.
 *
 * Pass the route path as the first argument to get fully typed parameters.
 * The returned Signal updates reactively when route parameters change.
 *
 * When a schema is provided, parameter values are coerced/transformed at runtime:
 * - **Constructor schema**: `{ productId: Number }` coerces `'123'` → `123`
 * - **StandardSchema v1**: Zod 4+, Valibot, ArkType schemas validate and transform
 *
 * **Important**: This function requires `routes.d.ts` to be generated for
 * full type safety. Run `npm run dev` or `npm run build` to generate it.
 *
 * @param _route - The route path (used for type inference, ignored at runtime)
 * @param schema - Optional schema to transform parameter values at runtime. Can be:
 *   - An object with type constructors: `{ productId: Number, active: Boolean }`
 *   - A StandardSchema v1 compatible schema (Zod 4+, Valibot, ArkType, etc.)
 *
 * **Boolean coercion (lenient):**
 * - `'false'`, `'0'`, `''` → `false`
 * - All other non-empty strings → `true`
 *
 * **Number coercion:**
 * - Valid number strings → number
 * - Invalid strings → `NaN`
 *
 * @example
 * // In a page component: /products/[productId].page.ts
 * @Component({
 *   template: `<h1>Product {{ params().productId }}</h1>`
 * })
 * export default class ProductPage {
 *   // Without schema - params are strings
 *   params = injectParams('/products/[productId]');
 *   // Type: Signal<{ productId: string }>, Runtime: { productId: '123' }
 * }
 *
 * @example
 * // Transform parameter values with constructors
 * @Component({...})
 * export default class ProductPage {
 *   params = injectParams('/products/[productId]', { productId: Number });
 *   // Type: Signal<{ productId: number }>, Runtime: { productId: 123 }
 * }
 *
 * @example
 * // Transform with Zod schema (StandardSchema v1)
 * import { z } from 'zod';
 * @Component({...})
 * export default class ProductPage {
 *   params = injectParams('/products/[productId]',
 *     z.object({ productId: z.coerce.number() })
 *   );
 *   // Type: Signal<{ productId: number }>, Runtime: { productId: 123 }
 * }
 *
 * @returns Signal containing the typed (and optionally transformed) route parameters
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
>(_route?: T, schema?: S): Signal<InjectParamsReturn<T, S> | TypedParams> {
  const activatedRoute = inject(ActivatedRoute);

  return toSignal(
    activatedRoute.paramMap.pipe(
      map((paramMap) => {
        // Build raw params from route
        const rawParams: Record<string, string> = {};
        for (const key of paramMap.keys) {
          rawParams[key] = paramMap.get(key) ?? '';
        }

        // No schema provided - return raw string params
        if (!schema) {
          return rawParams;
        }

        // StandardSchema v1 (Zod 4+, Valibot, ArkType, etc.)
        if (isStandardSchema(schema)) {
          return transformWithStandardSchema(rawParams, schema);
        }

        // Constructor schema ({ id: Number, active: Boolean })
        if (isConstructorSchema(schema)) {
          return transformWithConstructors(rawParams, schema);
        }

        // Unknown schema type - warn and return raw params
        console.warn(
          '[Analog] injectParams: unknown schema type provided, returning raw params',
        );
        return rawParams;
      }),
    ),
    { requireSync: true },
  ) as Signal<InjectParamsReturn<T, S> | TypedParams>;
}
