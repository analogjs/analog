import { createServerFnRef } from '@analogjs/router';
import type {
  ServerFn,
  ServerFnConfig,
  ServerFnHandler,
} from '@analogjs/router';

import { serverFnRegistry } from './registry';

/**
 * Define a server function. Authored in a `*.server.ts` module.
 *
 * On the server the function self-registers and its handler runs via
 * `dispatchServerFn`. On the client the build transform replaces the body with
 * a proxy that calls the `/_analog/fn/<id>` endpoint; the reference still
 * carries `id`/`url`/`method` so `injectServerFn`/`ServerFnClient` can dispatch.
 */
export function serverFn<In, Out>(
  config: ServerFnConfig<In>,
  handler: ServerFnHandler<In, Out>,
): ServerFn<In, Out> {
  const ref = createServerFnRef<In, Out>(config);

  serverFnRegistry.set(config.id, {
    id: config.id,
    method: ref.method,
    config: config as ServerFnConfig<unknown>,
    handler: handler as ServerFnHandler<unknown, unknown>,
  });

  return ref;
}
