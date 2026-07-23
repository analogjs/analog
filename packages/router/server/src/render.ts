import {
  ApplicationConfig,
  Provider,
  Type,
  enableProdMode,
} from '@angular/core';
import {
  bootstrapApplication,
  type BootstrapContext,
} from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';
import type { ServerContext } from '@analogjs/router/tokens';

import { provideServerContext } from './provide-server-context';
import { resetComponentDefTViews } from './utils/reset-component-def-tviews';

// Optional chaining: the server-function dispatch endpoint imports this entry
// from a Nitro bundle, where `import.meta.env` is not defined at all.
if (import.meta.env?.PROD) {
  enableProdMode();
}

/**
 * Returns a function that accepts the navigation URL,
 * the root HTML, and server context.
 *
 * @param rootComponent
 * @param config
 * @param platformProviders
 * @returns Promise<string | Reponse>
 */
export function render(
  rootComponent: Type<unknown>,
  config: ApplicationConfig,
  platformProviders: Provider[] = [],
) {
  function bootstrap(context?: BootstrapContext) {
    return bootstrapApplication(rootComponent, config, context);
  }

  return async function render(
    url: string,
    document: string,
    serverContext: ServerContext,
  ) {
    resetComponentDefTViews();

    const html = await renderApplication(bootstrap, {
      document,
      url,
      platformProviders: [
        provideServerContext(serverContext),
        platformProviders,
      ],
    });

    return html;
  };
}
