/**
 * String-based SSR renderer for Analog.
 *
 * Uses a lightweight DOM shim and a custom string-based Renderer2
 * instead of full browser DOM emulation (Happy DOM / Domino).
 * Designed for performance and edge runtime portability.
 */

import {
  ApplicationConfig,
  Provider,
  RendererFactory2,
  Type,
  enableProdMode,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import {
  bootstrapApplication,
  type BootstrapContext,
} from '@angular/platform-browser';
import {
  BEFORE_APP_SERIALIZED,
  renderApplication,
} from '@angular/platform-server';
import type { ServerContext } from '@analogjs/router/tokens';

import { provideServerContext } from './provide-server-context';
import {
  serverComponentRequest,
  renderServerComponent,
} from './server-component-render';
import { createDocument } from './ssr/dom-shim';
import { StringRendererFactory2 } from './ssr/string-renderer';

if (import.meta.env.PROD) {
  enableProdMode();
}

/**
 * Returns a function that renders the application to an HTML string
 * using a lightweight string-based renderer instead of full DOM emulation.
 *
 * Usage in main.server.ts:
 * ```ts
 * import { renderToString } from '@analogjs/router/server';
 * import { App } from './app/app';
 * import { config } from './app/app.config.server';
 *
 * export default renderToString(App, config);
 * ```
 *
 * @param rootComponent The root component class
 * @param config The application configuration
 * @param platformProviders Additional platform-level providers
 * @returns An async function that renders a URL to an HTML string
 */
export function renderToString(
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
    // Server component requests use their own rendering path
    if (serverComponentRequest(serverContext)) {
      return await renderServerComponent(url, serverContext);
    }

    // Create a lightweight shim document from the HTML template
    const shimDocument = createDocument(document);

    // Create the string-based renderer factory
    const rendererFactory = new StringRendererFactory2(shimDocument);

    // Find the app root selector from the template
    // Angular's app root is typically the first unknown element in <body>
    const appRootSelector = findAppRootSelector(document);

    const html = await renderApplication(bootstrap, {
      document: shimDocument as any,
      url,
      platformProviders: [
        provideServerContext(serverContext),
        // Provide our shim document as the DOCUMENT token
        { provide: DOCUMENT, useValue: shimDocument },
        // Swap in our string-based renderer
        { provide: RendererFactory2, useValue: rendererFactory },
        // Inject rendered HTML into the shim document before serialization
        {
          provide: BEFORE_APP_SERIALIZED,
          useFactory: () => () => {
            rendererFactory.injectIntoDocument(appRootSelector);
          },
          multi: true,
        },
        ...platformProviders,
      ],
    });

    return html;
  };
}

/**
 * Finds the app root element selector from an HTML template string.
 * Looks for the first custom element (contains a hyphen) in the body,
 * which is the Angular convention for app root components.
 */
function findAppRootSelector(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    // Look for first custom element tag (contains a hyphen, Angular convention)
    const customElMatch = bodyMatch[1].match(/<([a-z][a-z0-9]*-[a-z0-9-]*)/i);
    if (customElMatch) {
      return customElMatch[1];
    }
  }
  // Fallback: try common Angular root selectors
  return 'app-root';
}
