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
import type { ServerContext } from '../../tokens/src/index.js';

import { provideServerContext } from './provide-server-context';
import {
  serverComponentRequest,
  renderServerComponent,
} from './server-component-render';

if (import.meta.env.PROD) {
  enableProdMode();
}

/**
 * Nulls `def.tView` on every component definition that Angular has
 * compiled in this process. Angular caches the result of `consts()` on
 * `def.tView` — that factory is where `$localize` tagged templates are
 * evaluated — so without this reset the first rendered locale would be
 * frozen into the cache for the process lifetime.
 *
 * The set on `globalThis.__ngComponentDefs` is populated by a Vite
 * transform in `@analogjs/platform` that patches `@angular/core`'s
 * `getComponentId()` to mirror every compiled component definition to
 * a global Set, bypassing the `ngServerMode` guard that normally
 * prevents registration on the server.
 */
function resetComponentDefTViews(): void {
  const defs = (globalThis as any).__ngComponentDefs as Set<any> | undefined;
  if (!defs) return;
  for (const def of defs) {
    def.tView = null;
  }
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
  ): Promise<string | Response> {
    if (serverComponentRequest(serverContext)) {
      return await renderServerComponent(url, serverContext);
    }

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
