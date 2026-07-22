import type { NitroEventHandler } from 'nitropack';
import { normalizePath } from 'vite';

import type { ServerFnHandlerModule } from './get-server-fn-handlers';

/**
 * Nitro virtual-module id for the generated server-function dispatch handler.
 * Referenced from `nitroConfig.handlers` and provided via `nitroConfig.virtual`.
 */
export const SERVER_FN_DISPATCH_VIRTUAL = '#ANALOG_SERVER_FN_DISPATCH';

/** The single transport route all server functions dispatch through. */
export const SERVER_FN_DISPATCH_ROUTE = '/_analog/fn/:id';

/** URL prefix of that route, for matching requests before the id is known. */
export const SERVER_FN_DISPATCH_PREFIX = '/_analog/fn/';

/**
 * The Nitro handler registration for the server-function dispatch route.
 * Unlike page endpoints (one handler per file), every server function shares
 * this one `/_analog/fn/:id` route; the id selects the function at runtime.
 *
 * The route is fixed and NOT `/api`-prefixed: client proxies always call the
 * absolute `/_analog/fn/:id` URL, so an `/api` prefix (as page endpoints use)
 * would leave the handler unreachable in apps that have an API directory.
 */
export function getServerFnDispatchHandler(): NitroEventHandler {
  return {
    route: SERVER_FN_DISPATCH_ROUTE,
    handler: SERVER_FN_DISPATCH_VIRTUAL,
    lazy: true,
  };
}

export type BuildServerFnDispatchModuleArgs = {
  /** Discovered `*.server.ts` modules, imported for registration side-effects. */
  modules: ServerFnHandlerModule[];
  /**
   * Absolute path to a module exporting `serverFnAppProviders`
   * (`StaticProvider[]`) that are made available inside handlers. When absent,
   * handlers run with no app providers.
   */
  providersModule?: string;
};

/**
 * Generates the source of the Nitro dispatch handler.
 *
 * The handler imports every discovered `*.server.ts` module so each
 * `serverFn(...)` registers itself, imports the app provider set (if any), then
 * on each request looks up the function by id and runs it via `dispatchServerFn`
 * — the same call path the validation harnesses exercise.
 */
export function buildServerFnDispatchModule({
  modules,
  providersModule,
}: BuildServerFnDispatchModuleArgs): string {
  const registrationImports = modules
    .map((m) => `import ${JSON.stringify(normalizePath(m.file))};`)
    .join('\n');

  const providers = providersModule
    ? `import { serverFnAppProviders } from ${JSON.stringify(
        normalizePath(providersModule),
      )};`
    : `const serverFnAppProviders = [];`;

  // `@analogjs/router/server` is a partially-compiled Angular library, and this
  // module is bundled by Nitro rather than by the app's Angular pipeline, so the
  // linker never runs over it. Loading the compiler gives it the JIT fallback.
  return `import '@angular/compiler';
import { eventHandler, getRouterParam, readBody } from 'h3';
import { Injector } from '@angular/core';
import { dispatchServerFn } from '@analogjs/router/server';

// Discovered server-function modules (registration side-effects).
${registrationImports}

${providers}

// The app injector is built once; each request gets a child with REQUEST/RESPONSE.
const appInjector = Injector.create({ providers: serverFnAppProviders });

export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  const input = event.method === 'GET' ? undefined : await readBody(event);

  const { status, body, headers } = await dispatchServerFn(id, input, event, {
    parent: appInjector,
    method: event.method,
  });

  event.node.res.statusCode = status;
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      event.node.res.setHeader(key, value);
    }
  }
  return body;
});
`;
}
