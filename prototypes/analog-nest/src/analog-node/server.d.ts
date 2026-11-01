declare module 'virtual:analog-node/server' {
  import type { ApplicationConfig } from '@angular/core';
  import type { ServerContext } from '@analogjs/router/tokens';

  type PageEndpointModule = {
    load?: (ctx: unknown) => unknown;
    action?: (ctx: unknown) => unknown;
  };

  /** The app's SSR entry (`main.server.ts` default export). */
  export const render: (
    url: string,
    document: string,
    context: ServerContext,
  ) => Promise<string>;
  /** The app's server config (`app.config.server.ts`). */
  export const config: ApplicationConfig;
  export const apiPrefix: string;
  /** Page endpoint route → lazy `*.server.ts` module. */
  export const pageEndpoints: Record<string, () => Promise<PageEndpointModule>>;
}
