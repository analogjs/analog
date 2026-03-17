import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { H3Event, H3EventContext } from 'nitro/h3';
import type { $Fetch } from 'nitro/types';
import { fail } from './actions';
import { parseSearchParams } from './parse-request-data';
import { validateWithSchema } from './validate';

type NodeContext = NonNullable<H3Event['node']>;
type OptionalSchema = StandardSchemaV1 | undefined;
type InferSchema<
  TSchema extends OptionalSchema,
  TFallback,
> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<TSchema>
  : TFallback;

export interface PageLoadContext<
  TParamsSchema extends OptionalSchema = undefined,
  TQuerySchema extends OptionalSchema = undefined,
> {
  params: InferSchema<TParamsSchema, H3EventContext['params']>;
  query: InferSchema<
    TQuerySchema,
    Record<string, string | string[] | undefined>
  >;
  req: NodeContext['req'];
  res: NonNullable<NodeContext['res']>;
  fetch: $Fetch;
  event: H3Event;
}

export interface DefinePageLoadOptions<
  TParamsSchema extends OptionalSchema = undefined,
  TQuerySchema extends OptionalSchema = undefined,
> {
  params?: TParamsSchema;
  query?: TQuerySchema;
  handler: (
    context: PageLoadContext<TParamsSchema, TQuerySchema>,
  ) => Promise<unknown>;
}

/**
 * Creates a typed page server load function with optional
 * Standard Schema validation for route params and query.
 *
 * Follows the same validation patterns as `defineAction` and
 * `defineApiRoute`: validates before invoking the handler,
 * returns `fail(422, issues)` on validation failure.
 *
 * @example
 * ```typescript
 * // src/app/pages/users/[id].server.ts
 * import { definePageLoad } from '@analogjs/router/server/actions';
 * import * as v from 'valibot';
 *
 * export const routeParamsSchema = v.object({
 *   id: v.pipe(v.string(), v.regex(/^\d+$/)),
 * });
 *
 * export const load = definePageLoad({
 *   params: routeParamsSchema,
 *   handler: async ({ params, fetch }) => {
 *     // params.id is typed as string (validated)
 *     const user = await fetch(`/api/users/${params.id}`);
 *     return user;
 *   },
 * });
 * ```
 */
export function definePageLoad<
  TParamsSchema extends OptionalSchema = undefined,
  TQuerySchema extends OptionalSchema = undefined,
>(
  options: DefinePageLoadOptions<TParamsSchema, TQuerySchema>,
): (ctx: {
  params: H3EventContext['params'];
  req: NodeContext['req'];
  res: NonNullable<NodeContext['res']>;
  fetch: $Fetch;
  event: H3Event;
}) => Promise<unknown> {
  type Params = InferSchema<TParamsSchema, H3EventContext['params']>;
  type Query = InferSchema<
    TQuerySchema,
    Record<string, string | string[] | undefined>
  >;

  return async (ctx: {
    params: H3EventContext['params'];
    req: NodeContext['req'];
    res: NonNullable<NodeContext['res']>;
    fetch: $Fetch;
    event: H3Event;
  }) => {
    let params: unknown = ctx.params ?? {};
    let query: unknown = {};

    // Validate params
    if (options.params) {
      const result = await validateWithSchema(options.params, params);
      if (result.issues) {
        return fail(422, result.issues);
      }
      params = result.value;
    }

    // Validate query
    if (options.query) {
      const url = new URL(
        (ctx.event as H3Event & { request: Request }).request.url,
        'http://localhost',
      );
      const rawQuery = parseSearchParams(url.searchParams);
      const result = await validateWithSchema(options.query, rawQuery);
      if (result.issues) {
        return fail(422, result.issues);
      }
      query = result.value;
    }

    return options.handler({
      params: params as Params,
      query: query as Query,
      req: ctx.req,
      res: ctx.res,
      fetch: ctx.fetch,
      event: ctx.event,
    });
  };
}
