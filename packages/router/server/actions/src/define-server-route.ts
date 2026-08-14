import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { H3Event } from 'nitro/h3';
import { getRequestURL } from 'nitro/h3';
import { fail, json } from './actions';
import { parseRequestData, parseSearchParams } from './parse-request-data';
import { validateWithSchema } from './validate';

export type DefineServerRouteResult = Response | unknown;

export interface ServerRouteHandler<
  TQuery = unknown,
  TBody = unknown,
  TResult = unknown,
> {
  (event: H3Event): Promise<Response>;
  readonly _types: {
    readonly query: TQuery;
    readonly body: TBody;
    readonly result: TResult;
  };
}

export type InferRouteQuery<T> =
  T extends ServerRouteHandler<infer Q, any, any> ? Q : never;
export type InferRouteBody<T> =
  T extends ServerRouteHandler<any, infer B, any> ? B : never;
export type InferRouteResult<T> =
  T extends ServerRouteHandler<any, any, infer R>
    ? Exclude<R, Response>
    : never;

type OptionalSchema = StandardSchemaV1 | undefined;
type InferSchema<
  TSchema extends OptionalSchema,
  TFallback = unknown,
> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<TSchema>
  : TFallback;
type ResolveDataSchema<
  TInput extends OptionalSchema,
  TQuery extends OptionalSchema,
  TBody extends OptionalSchema,
> = TInput extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<TInput>
  : TQuery extends StandardSchemaV1
    ? TBody extends StandardSchemaV1
      ?
          | StandardSchemaV1.InferOutput<TQuery>
          | StandardSchemaV1.InferOutput<TBody>
      : StandardSchemaV1.InferOutput<TQuery>
    : TBody extends StandardSchemaV1
      ? StandardSchemaV1.InferOutput<TBody>
      : unknown;

export interface DefineServerRouteContext<
  TInput extends StandardSchemaV1 | undefined = undefined,
  TQuery extends StandardSchemaV1 | undefined = undefined,
  TBody extends StandardSchemaV1 | undefined = undefined,
  TParams extends StandardSchemaV1 | undefined = undefined,
> {
  data: ResolveDataSchema<TInput, TQuery, TBody>;
  query: InferSchema<TQuery, undefined>;
  body: InferSchema<TBody, undefined>;
  params: InferSchema<TParams, H3Event['context']['params']>;
  event: H3Event;
}

export interface DefineServerRouteOptions<
  TInput extends StandardSchemaV1 | undefined = undefined,
  TOutput extends StandardSchemaV1 | undefined = undefined,
  TQuery extends StandardSchemaV1 | undefined = undefined,
  TBody extends StandardSchemaV1 | undefined = undefined,
  TParams extends StandardSchemaV1 | undefined = undefined,
  TResult extends DefineServerRouteResult = DefineServerRouteResult,
> {
  input?: TInput;
  query?: TQuery;
  body?: TBody;
  params?: TParams;
  output?: TOutput;
  handler: (
    context: DefineServerRouteContext<TInput, TQuery, TBody, TParams>,
  ) => Promise<TResult> | TResult;
}

function isDevEnvironment() {
  return (
    typeof process !== 'undefined' &&
    (process.env['NODE_ENV'] === 'development' ||
      process.env['NODE_ENV'] === 'test')
  );
}

function warnOnOutputIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>) {
  console.warn(
    `[analog] Server route output validation failed:\n` +
      issues
        .map((i) => {
          const path = i.path
            ? ` at "${i.path.map((p) => (typeof p === 'object' ? (p as { key: string }).key : p)).join('.')}"`
            : '';
          return `  - ${i.message}${path}`;
        })
        .join('\n'),
  );
}

function getRequestUrl(event: H3Event): string {
  try {
    return getRequestURL(event).href;
  } catch {
    return (event as H3Event & { request: Request }).request.url;
  }
}

/**
 * Creates an h3-compatible event handler with Standard Schema validation.
 *
 * - `input` schema validates the request body (POST/PUT/PATCH) or query
 *   params (GET). Returns 422 with `StandardSchemaV1.Issue[]` on failure.
 * - `output` schema validates the response in development only (stripped
 *   in production for zero overhead). Logs a warning on mismatch.
 * - Plain return values are serialized with `json(...)`; raw `Response`
 *   objects are returned unchanged.
 *
 * @example
 * ```typescript
 * import { defineServerRoute } from '@analogjs/router/server/actions';
 * import * as v from 'valibot';
 *
 * const Input = v.object({
 *   name: v.pipe(v.string(), v.minLength(1)),
 *   email: v.pipe(v.string(), v.email()),
 * });
 * const Output = v.object({
 *   id: v.string(),
 *   name: v.string(),
 * });
 *
 * export default defineServerRoute({
 *   input: Input,
 *   output: Output,
 *   handler: async ({ data }) => {
 *     const user = await db.users.create(data);
 *     return user;
 *   },
 * });
 * ```
 */
export function defineServerRoute<
  TInput extends StandardSchemaV1 | undefined = undefined,
  TOutput extends StandardSchemaV1 | undefined = undefined,
  TQuery extends StandardSchemaV1 | undefined = undefined,
  TBody extends StandardSchemaV1 | undefined = undefined,
  TParams extends StandardSchemaV1 | undefined = undefined,
  TResult extends DefineServerRouteResult = DefineServerRouteResult,
>(
  options: DefineServerRouteOptions<
    TInput,
    TOutput,
    TQuery,
    TBody,
    TParams,
    TResult
  >,
): ServerRouteHandler<
  InferSchema<TQuery, undefined>,
  InferSchema<TBody, undefined>,
  TResult
> {
  return (async (event: H3Event): Promise<Response> => {
    const method = event.method.toUpperCase();
    let data: unknown;
    let query: unknown;
    let body: unknown;
    let params: unknown = event.context?.params ?? {};

    if (options.params) {
      const paramsResult = await validateWithSchema(options.params, params);
      if (paramsResult.issues) {
        return fail(422, paramsResult.issues);
      }
      params = paramsResult.value;
    }

    if (options.input) {
      data = await parseRequestData(event);

      const inputResult = await validateWithSchema(options.input, data);
      if (inputResult.issues) {
        return fail(422, inputResult.issues);
      }
      data = inputResult.value;
    } else {
      if (options.query) {
        const url = new URL(getRequestUrl(event), 'http://localhost');
        const queryResult = await validateWithSchema(
          options.query,
          parseSearchParams(url.searchParams),
        );
        if (queryResult.issues) {
          return fail(422, queryResult.issues);
        }
        query = queryResult.value;
      }

      if (options.body && method !== 'GET' && method !== 'HEAD') {
        body = await parseRequestData(event);
        const bodyResult = await validateWithSchema(options.body, body);
        if (bodyResult.issues) {
          return fail(422, bodyResult.issues);
        }
        body = bodyResult.value;
      }

      if (method === 'GET' || method === 'HEAD') {
        data = query;
      } else if (body !== undefined) {
        data = body;
      } else {
        data = query;
      }
    }

    const result = await options.handler({
      data: data as ResolveDataSchema<TInput, TQuery, TBody>,
      query: query as InferSchema<TQuery, undefined>,
      body: body as InferSchema<TBody, undefined>,
      params: params as InferSchema<TParams, H3Event['context']['params']>,
      event,
    });

    if (result instanceof Response) {
      return result;
    }

    if (options.output && isDevEnvironment()) {
      const outputResult = await validateWithSchema(options.output, result);
      if (outputResult.issues) {
        warnOnOutputIssues(outputResult.issues);
      }
    }

    return json(result);
  }) as ServerRouteHandler<
    InferSchema<TQuery, undefined>,
    InferSchema<TBody, undefined>,
    TResult
  >;
}
