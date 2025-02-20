import {
  ApplicationConfig,
  Provider,
  Type,
  enableProdMode,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';
import type { ServerContext } from '@analogjs/router/tokens';

import { provideServerContext } from './provide-server-context';
import {
  serverComponentRequest,
  renderServerComponent,
} from './server-component-render';

if (import.meta.env.PROD) {
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
  function bootstrap() {
    return bootstrapApplication(rootComponent, config);
  }

  return async function render(
    url: string,
    document: string,
    serverContext: ServerContext,
  ) {
    if (serverComponentRequest(serverContext)) {
      return await renderServerComponent(url, serverContext);
    }

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
