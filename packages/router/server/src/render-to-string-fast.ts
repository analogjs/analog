/**
 * Cached-platform SSR renderer — experimental.
 *
 * `renderApplication` from @angular/platform-server creates a fresh
 * platform per request and tears it down in a `finally` block. The
 * platform itself owns Domino's adapter init, the platform injector, and
 * a handful of singletons (PlatformState, PlatformLocation). Recreating
 * those on every request is pure overhead — they don't change.
 *
 * This module keeps a single platform alive across requests and only
 * recreates the application injector. DOCUMENT and RendererFactory2 are
 * overridden at the app/environment injector per request, so the
 * component tree sees the per-request shim while platform-level
 * singletons stay shared.
 *
 * Caveats (intentional, prototype-level):
 *
 *   - `PlatformState.getDocument()` returns the platform-level DOCUMENT
 *     that was bound at platform creation, NOT the per-request shim. We
 *     side-step this by serializing our shim directly instead of going
 *     through `PlatformState.renderToString()`.
 *
 *   - `ServerPlatformLocation` is constructed once per platform from
 *     `INITIAL_CONFIG.url`, so URL is fixed to whatever the platform was
 *     created with. Apps that read `PlatformLocation` for routing-side
 *     work will see stale state. The Angular Router resolves the active
 *     URL from the application's bootstrap context, not PlatformLocation,
 *     so basic routing still works — but anything reading
 *     `platformLocation.href` directly will be wrong.
 *
 *   - Hydration annotation is currently skipped. Wire it back in by
 *     calling `ɵannotateForHydration(applicationRef, shimDocument)`
 *     before serialization if hydration is enabled in the app config.
 */

import {
  ApplicationConfig,
  ApplicationRef,
  PlatformRef,
  RendererFactory2,
  StaticProvider,
  Type,
  enableProdMode,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  BEFORE_APP_SERIALIZED,
  INITIAL_CONFIG,
  platformServer,
} from '@angular/platform-server';
import type { ServerContext } from '@analogjs/router/tokens';

import { provideServerContext } from './provide-server-context';
import {
  serverComponentRequest,
  renderServerComponent,
} from './server-component-render';
import { createDocument, serializeDocument } from './ssr/dom-shim';
import { StringRendererFactory2V2 } from './ssr/string-renderer-v2';
import { resetComponentDefTViews } from './utils/reset-component-def-tviews';

if (import.meta.env.PROD) {
  enableProdMode();
}

/**
 * Lazily-initialized shared platform. The first call creates it with a
 * placeholder document/url; per-request DOCUMENT is supplied at the app
 * injector level.
 */
let sharedPlatform: PlatformRef | null = null;

function getOrCreatePlatform(
  extraPlatformProviders: StaticProvider[],
): PlatformRef {
  if (sharedPlatform) return sharedPlatform;
  sharedPlatform = platformServer([
    {
      provide: INITIAL_CONFIG,
      useValue: {
        // Empty placeholder — the real document is provided per-request
        // via the application injector and read by component code.
        document:
          '<!DOCTYPE html><html><head></head><body><app-root></app-root></body></html>',
        url: '/',
      },
    },
    ...extraPlatformProviders,
  ]);
  return sharedPlatform;
}

/**
 * Manually destroy the cached platform. Useful for tests and graceful
 * shutdown — production servers should let the platform live for the
 * process lifetime.
 */
export function destroySharedPlatform(): Promise<void> {
  const p = sharedPlatform;
  sharedPlatform = null;
  if (!p) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(() => {
      p.destroy();
      resolve();
    }, 0);
  });
}

export function renderToStringFast(
  rootComponent: Type<unknown>,
  config: ApplicationConfig,
  platformProviders: StaticProvider[] = [],
) {
  return async function render(
    url: string,
    document: string,
    serverContext: ServerContext,
  ) {
    if (serverComponentRequest(serverContext)) {
      return await renderServerComponent(url, serverContext);
    }

    resetComponentDefTViews();

    const shimDocument = createDocument(document);
    const rendererFactory = new StringRendererFactory2V2(shimDocument);
    const appRootSelector = findAppRootSelector(document);

    const platform = getOrCreatePlatform(platformProviders);

    const requestConfig: ApplicationConfig = {
      ...config,
      providers: [
        ...(config.providers ?? []),
        // App-level DOCUMENT override — every component / service that
        // injects DOCUMENT sees the per-request shim. Platform-level
        // PlatformState and PlatformLocation still hold the platform
        // DOCUMENT, but we don't use them for serialization.
        { provide: DOCUMENT, useValue: shimDocument },
        { provide: RendererFactory2, useValue: rendererFactory },
        provideServerContext(serverContext),
        {
          provide: BEFORE_APP_SERIALIZED,
          useFactory: () => () => {
            rendererFactory.injectIntoDocument(appRootSelector);
          },
          multi: true,
        },
      ],
    };

    let applicationRef: ApplicationRef | null = null;
    try {
      applicationRef = await bootstrapApplication(
        rootComponent,
        requestConfig,
        { platformRef: platform },
      );
      await applicationRef.whenStable();

      // Run BEFORE_APP_SERIALIZED hooks ourselves — we're not going
      // through `renderInternal`, so platform-server doesn't run them
      // for us.
      const callbacks = applicationRef.injector.get(
        BEFORE_APP_SERIALIZED,
        null,
      );
      if (callbacks) {
        for (const cb of callbacks) {
          try {
            await cb();
          } catch (e) {
            console.warn('Ignoring BEFORE_APP_SERIALIZED Exception: ', e);
          }
        }
      }

      return serializeDocument(shimDocument);
    } finally {
      // Destroy just the application — keep the platform alive.
      if (applicationRef) {
        try {
          applicationRef.destroy();
        } catch {
          // ignore
        }
      }
    }
  };
}

function findAppRootSelector(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const customElMatch = bodyMatch[1].match(/<([a-z][a-z0-9]*-[a-z0-9-]*)/i);
    if (customElMatch) return customElMatch[1];
  }
  return 'app-root';
}
