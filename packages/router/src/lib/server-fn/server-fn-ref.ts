import type { ServerFn, ServerFnMethod } from './types';

export interface ServerFnRefConfig {
  id: string;
  method?: ServerFnMethod;
  /**
   * Only its presence matters here: when `method` is omitted, a config with an
   * `input` schema defaults to `POST`, otherwise `GET`. The schema itself is
   * never used to build the ref — validation happens server-side.
   */
  input?: unknown;
}

/**
 * Builds a server-function reference: the client-safe `{ __serverFn, id, url,
 * method }` metadata that `injectServerFn`/`ServerFnClient` dispatch through.
 *
 * Shared by both sides so they produce identical refs: the server `serverFn`
 * wraps this with registration + the handler, and the client build's scrub
 * transform emits a call to this factory in place of the server module so the
 * browser bundle carries only the ref, never the handler or its server imports.
 *
 * The returned value is callable-typed but throws if invoked directly — it is
 * always dispatched via `injectServerFn`/`ServerFnClient`, never called.
 */
export function createServerFnRef<In, Out>(
  config: ServerFnRefConfig,
): ServerFn<In, Out> {
  const method: ServerFnMethod =
    config.method ?? (config.input ? 'POST' : 'GET');
  const url = `/_analog/fn/${config.id}`;

  const ref = (() => {
    throw new Error(
      `serverFn "${config.id}" must be called via injectServerFn/ServerFnClient`,
    );
  }) as unknown as ServerFn<In, Out>;

  return Object.assign(ref, {
    __serverFn: true as const,
    id: config.id,
    url,
    method,
  });
}
