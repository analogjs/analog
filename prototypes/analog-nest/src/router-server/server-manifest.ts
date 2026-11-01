import type { ServerContext } from '@analogjs/router/tokens';
import type { ApplicationConfig } from '@angular/core';

export type PageEndpointModule = {
  load?: (ctx: unknown) => unknown;
  action?: (ctx: unknown) => unknown;
};

export type ServerRender = (
  url: string,
  document: string,
  context: ServerContext,
) => Promise<string>;

/** Everything the handler needs from the app, as lazy imports. */
export type AnalogServerManifest = {
  apiPrefix: string;
  /** The app's SSR entry (`main.server.ts` default export). */
  render: () => Promise<ServerRender>;
  /** The app's server config (`app.config.server.ts`). */
  config: () => Promise<ApplicationConfig>;
  /** Every `*.server.ts`, imported so server functions register. */
  serverFnModules: (() => Promise<unknown>)[];
  /** Page endpoint route → `*.server.ts` module. */
  pageEndpoints: Record<string, () => Promise<PageEndpointModule>>;
};

/**
 * Filled in at build time by the platform's server plugin, the same way the
 * router plugin fills in `ANALOG_ROUTE_FILES`. Empty without it.
 */
export const ANALOG_SERVER_MANIFEST = {} as Partial<AnalogServerManifest>;
