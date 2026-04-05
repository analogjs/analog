import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { H3Event, H3EventContext } from 'nitro/h3';
import type { $Fetch } from 'nitro/types';
import { fail } from './actions';
import { parseRequestData } from './parse-request-data';
import { validateWithSchema } from './validate';

type NodeContext = NonNullable<H3Event['node']>;
type OptionalSchema = StandardSchemaV1 | undefined;
type InferSchema<
  TSchema extends OptionalSchema,
  TFallback,
> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<TSchema>
  : TFallback;

export interface DefineActionContext<
  TSchema extends OptionalSchema = undefined,
  TParamsSchema extends OptionalSchema = undefined,
> {
  data: InferSchema<TSchema, Record<string, unknown>>;
  params: InferSchema<TParamsSchema, H3EventContext['params']>;
  req: NodeContext['req'];
  res: NonNullable<NodeContext['res']>;
  fetch: $Fetch;
  event: H3Event;
}

export interface DefineActionOptions<
  TSchema extends OptionalSchema = undefined,
  TParamsSchema extends OptionalSchema = undefined,
> {
  schema?: TSchema;
  params?: TParamsSchema;
  handler: (
    context: DefineActionContext<TSchema, TParamsSchema>,
  ) => Promise<Response> | Response;
}

/**
 * Creates a server action handler with Standard Schema input validation.
 *
 * Parses the request body (JSON or FormData) and validates it against the
 * provided schema before invoking the handler. On validation failure,
 * returns `fail(422, issues)` with `StandardSchemaV1.Issue[]`.
 * Repeated form fields are preserved as arrays instead of being collapsed
 * to the last value.
 *
 * @example
 * ```typescript
 * import { defineAction, json } from '@analogjs/router/server/actions';
 * import * as v from 'valibot';
 *
 * const Schema = v.object({
 *   email: v.pipe(v.string(), v.email()),
 * });
 *
 * export const action = defineAction({
 *   schema: Schema,
 *   handler: async ({ data }) => {
 *     // data is typed as { email: string }
 *     return json({ ok: true });
 *   },
 * });
 * ```
 */
export function defineAction<
  TSchema extends OptionalSchema = undefined,
  TParamsSchema extends OptionalSchema = undefined,
>(options: DefineActionOptions<TSchema, TParamsSchema>) {
  type Params = InferSchema<TParamsSchema, H3EventContext['params']>;

  function getParams(
    params: H3EventContext['params'],
  ): Params | Record<string, never> {
    return (params ?? {}) as Params | Record<string, never>;
  }

  return async (ctx: {
    params: H3EventContext['params'];
    req: NodeContext['req'];
    res: NonNullable<NodeContext['res']>;
    fetch: $Fetch;
    event: H3Event;
  }): Promise<Response> => {
    const rawParams = getParams(ctx.params);

    if (options.params) {
      const paramsResult = await validateWithSchema(options.params, rawParams);
      if (paramsResult.issues) {
        return fail(422, paramsResult.issues);
      }
      return handleValidatedRequest(ctx, options, paramsResult.value as Params);
    }

    return handleValidatedRequest(ctx, options, rawParams as Params);
  };
}

async function handleValidatedRequest<
  TSchema extends OptionalSchema = undefined,
  TParamsSchema extends OptionalSchema = undefined,
>(
  ctx: {
    params: H3EventContext['params'];
    req: NodeContext['req'];
    res: NonNullable<NodeContext['res']>;
    fetch: $Fetch;
    event: H3Event;
  },
  options: DefineActionOptions<TSchema, TParamsSchema>,
  params: InferSchema<TParamsSchema, H3EventContext['params']>,
) {
  type Data = InferSchema<TSchema, Record<string, unknown>>;
  const body = await parseRequestData(ctx.event);

  let data: unknown = body;

  if (options.schema) {
    const result = await validateWithSchema(options.schema, body);
    if (result.issues) {
      return fail(422, result.issues);
    }
    data = result.value;
  }

  return options.handler({
    data: data as Data,
    params,
    req: ctx.req,
    res: ctx.res,
    fetch: ctx.fetch,
    event: ctx.event,
  });
}
