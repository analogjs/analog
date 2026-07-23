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
   * Absolute path to the app's server config module (`app.config.server.ts`),
   * which exports the `ApplicationConfig` (as `config`) that `main.server.ts`
   * renders with. Handlers bootstrap against it, so they see the same DI the
   * app configured. When absent, handlers run with only `providedIn: 'root'`.
   */
  appConfigModule?: string;
};

/**
 * Generates the source of the Nitro dispatch handler.
 *
 * The handler imports every discovered `*.server.ts` module so each
 * `serverFn(...)` registers itself, imports the app's server config, then on
 * each request looks up the function by id and runs it via `dispatchServerFn` —
 * the same call path the validation harnesses exercise.
 */
export function buildServerFnDispatchModule({
  modules,
  appConfigModule,
}: BuildServerFnDispatchModuleArgs): string {
  const registrationImports = modules
    .map((m) => `import ${JSON.stringify(normalizePath(m.file))};`)
    .join('\n');

  // Bootstrap against the app's own server config so a handler resolves exactly
  // the services, tokens, and interceptors the app configured — one config, no
  // second provider list. Fall back to an empty config when the app has none.
  const appConfig = appConfigModule
    ? `import { config as serverFnAppConfig } from ${JSON.stringify(
        normalizePath(appConfigModule),
      )};`
    : `const serverFnAppConfig = { providers: [] };`;

  // `@analogjs/router/server` is a partially-compiled Angular library, and this
  // module is bundled by Nitro rather than by the app's Angular pipeline, so the
  // linker never runs over it. Loading the compiler gives it the JIT fallback.
  // `zone.js` and the server platform init match the SSR entry, so bootstrapping
  // the app injector below runs in the same environment a render would.
  //
  // The transport itself — id decoding, the malformed-body contract, dispatch,
  // and response writing — lives in `createServerFnEventHandler`, so this module
  // is only wiring: bootstrap the app injector from the app's server config, and
  // hand it to that handler.
  return `import '@angular/compiler';
import 'zone.js/node';
import '@angular/platform-server/init';
import { createServerFnAppInjector, createServerFnEventHandler } from '@analogjs/router/server';

// Discovered server-function modules (registration side-effects).
${registrationImports}

${appConfig}

// Bootstrapped once from the app's own server config, so a handler resolves the
// same DI as an SSR render (\`providedIn: 'root'\` and listed providers alike).
// No component is bootstrapped, so nothing renders and the router never
// navigates. Only REQUEST/RESPONSE are rebuilt per call.
export default createServerFnEventHandler(
  createServerFnAppInjector(serverFnAppConfig),
);
`;
}
