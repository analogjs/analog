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
 */
function resetComponentDefTViews(): void {
  const defs = (globalThis as any).__ngComponentDefs as Set<any> | undefined;
  if (!defs) return;
  for (const def of defs) {
    def.tView = null;
  }
}

/**
 * Splits an HTML document into a shell (everything before `<!--analog-outlet-->`)
 * and the remaining content. If no outlet marker is found, returns the full
 * document as the shell and an empty string as the remainder.
 */
export function splitHtmlIntoChunks(
  html: string,
  marker = '<!--analog-outlet-->',
): { shell: string; remainder: string } {
  const idx = html.indexOf(marker);
  if (idx === -1) {
    return { shell: html, remainder: '' };
  }
  return {
    shell: html.substring(0, idx + marker.length),
    remainder: html.substring(idx + marker.length),
  };
}

/**
 * Creates a streaming ReadableStream from a full HTML string.
 *
 * The stream sends the shell (everything up to and including `<!--analog-outlet-->`)
 * immediately, then streams the remaining content. This improves Time to First Byte
 * (TTFB) and First Contentful Paint (FCP) by sending the initial HTML shell
 * without waiting for all async data to resolve.
 *
 * If no outlet marker is found, the full HTML is sent as a single chunk.
 */
export function createStreamingResponse(
  html: string,
  headers?: Record<string, string>,
): Response {
  const { shell, remainder } = splitHtmlIntoChunks(html);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send the shell immediately
      controller.enqueue(encoder.encode(shell));

      if (remainder) {
        // Use queueMicrotask to schedule the remainder after start() returns.
        // This avoids Zone.js synchronous microtask draining which would
        // close the controller before the remainder is enqueued.
        queueMicrotask(() => {
          try {
            controller.enqueue(encoder.encode(remainder));
            controller.close();
          } catch {
            // Controller may already be closed if the consumer called cancel()
          }
        });
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/html',
      'Transfer-Encoding': 'chunked',
      ...headers,
    },
  });
}

/**
 * Returns a function that accepts the navigation URL,
 * the root HTML, and server context, streaming the response.
 *
 * When streaming is enabled, the HTML is split at the `<!--analog-outlet-->`
 * marker (if present) and sent in chunks. The shell is sent immediately,
 * improving TTFB and FCP.
 *
 * @param rootComponent
 * @param config
 * @param platformProviders
 * @returns A render function that returns a streaming Response
 */
export function renderStream(
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

    return createStreamingResponse(html);
  };
}
