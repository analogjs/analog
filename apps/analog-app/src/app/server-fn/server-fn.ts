import { serverFnRegistry } from './registry';
import type {
  ServerFn,
  ServerFnConfig,
  ServerFnHandler,
  ServerFnMethod,
} from './types';

/**
 * Define a server function. Authored in a `*.server.ts` module.
 *
 * Prototype note: this is isomorphic and self-registering. The promoted design
 * replaces the body on the client with a proxy via the build transform; here we
 * keep handlers dependency-light so the (unused) client copy is harmless.
 */
export function serverFn<In, Out>(
  config: ServerFnConfig<In>,
  handler: ServerFnHandler<In, Out>,
): ServerFn<In, Out> {
  const method: ServerFnMethod =
    config.method ?? (config.input ? 'POST' : 'GET');
  const url = `/_analog/fn/${config.id}`;

  serverFnRegistry.set(config.id, {
    id: config.id,
    method,
    config: config as ServerFnConfig<unknown>,
    handler: handler as ServerFnHandler<unknown, unknown>,
  });

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
