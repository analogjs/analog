import {
  ApplicationConfig,
  Provider,
  Type,
  enableProdMode,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';
import type { ServerContext } from '../../tokens/src/index.js';

import { provideServerContext } from './provide-server-context';
import { resetComponentDefTViews } from './utils/reset-component-def-tviews';
import { createSsrNavigationTracker } from './ssr-navigation';

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
 * @returns Promise<string>
 */
export function render(
  rootComponent: Type<unknown>,
  config: ApplicationConfig,
  platformProviders: Provider[] = [],
) {
  return async function render(
    url: string,
    document: string,
    serverContext: ServerContext,
  ): Promise<string> {
    resetComponentDefTViews();
    const navigation = createSsrNavigationTracker();
    const applicationConfig = {
      ...config,
      providers: [...config.providers, navigation.provider],
    };

    const html = await renderApplication(
      (context) =>
        bootstrapApplication(rootComponent, applicationConfig, context),
      {
        document,
        url,
        platformProviders: [
          provideServerContext(serverContext),
          platformProviders,
        ],
      },
    );
    navigation.throwIfFailed();
    return html;
  };
}
