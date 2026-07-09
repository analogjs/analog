import { createServerFnRef } from '@analogjs/router';
import type {
  ServerFn,
  ServerFnConfig,
  ServerFnHandler,
  StandardSchemaV1,
} from '@analogjs/router';

import { serverFnRegistry } from './registry';

/**
 * Define a server function. Authored in a `*.server.ts` module.
 *
 * Three call shapes, chosen for ergonomics — they all normalize to the same
 * `(config, handler)` form and the build transform derives the route id for each:
 *
 * ```ts
 * serverFn(() => inject(Svc).list());                  // input-less GET
 * serverFn(schema, (input) => …);                      // schema ⇒ POST + input
 * serverFn({ method: 'POST' }, () => …);               // explicit config
 * ```
 *
 * On the server the function self-registers and its handler runs via
 * `dispatchServerFn`. On the client the build transform replaces the body with a
 * proxy that calls `/_analog/fn/<id>`; the reference still carries
 * `id`/`url`/`method` so `injectServerFn`/`ServerFnClient` can dispatch.
 */
export function serverFn<Out>(
  handler: ServerFnHandler<void, Out>,
): ServerFn<void, Out>;
export function serverFn<In, Out>(
  input: StandardSchemaV1<In>,
  handler: ServerFnHandler<In, Out>,
): ServerFn<In, Out>;
export function serverFn<In, Out>(
  config: ServerFnConfig<In>,
  handler: ServerFnHandler<In, Out>,
): ServerFn<In, Out>;
export function serverFn(
  arg1: unknown,
  arg2?: ServerFnHandler<unknown, unknown>,
): ServerFn<unknown, unknown> {
  const { config, handler } = normalizeArgs(arg1, arg2);

  // GET is reserved for input-less reads; an input schema requires POST (the
  // input travels in the body, not the query). Build transforms reject this too.
  if (config.method === 'GET' && config.input) {
    throw new Error(
      '[analog] a serverFn with `input` must use POST; GET is reserved for input-less reads.',
    );
  }

  // `createServerFnRef` throws if the build-derived id is missing, so `ref.id`
  // is the authoritative route key here.
  const ref = createServerFnRef<unknown, unknown>(config);

  serverFnRegistry.set(ref.id, {
    id: ref.id,
    method: ref.method,
    config,
    handler,
  });

  return ref;
}

function normalizeArgs(
  arg1: unknown,
  arg2?: ServerFnHandler<unknown, unknown>,
): {
  config: ServerFnConfig<unknown>;
  handler: ServerFnHandler<unknown, unknown>;
} {
  // serverFn(handler) — input-less GET.
  if (typeof arg1 === 'function') {
    return {
      config: {},
      handler: arg1 as ServerFnHandler<unknown, unknown>,
    };
  }
  // serverFn(schema, handler) — a Standard Schema ⇒ POST + input.
  if (isStandardSchema(arg1)) {
    return {
      config: { input: arg1 as StandardSchemaV1<unknown> },
      handler: arg2 as ServerFnHandler<unknown, unknown>,
    };
  }
  // serverFn(config, handler) — explicit config object.
  return {
    config: (arg1 as ServerFnConfig<unknown>) ?? {},
    handler: arg2 as ServerFnHandler<unknown, unknown>,
  };
}

function isStandardSchema(value: unknown): value is StandardSchemaV1<unknown> {
  return typeof value === 'object' && value !== null && '~standard' in value;
}
