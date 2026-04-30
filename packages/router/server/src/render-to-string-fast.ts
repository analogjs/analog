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
 * What this module reimplements (`renderInternal` is bypassed):
 *
 *   - Hydration prep (`prepareForHydration`): ɵannotateForHydration on
 *     the application + SSR content-integrity marker comment + decide
 *     whether to keep or remove the inlined event-dispatch script.
 *   - Server-context attribute (`appendServerContextInfo`): set
 *     `ng-server-context` on each bootstrapped component's host.
 *   - `BEFORE_APP_SERIALIZED` callbacks (TransferState's serializer
 *     lives here, plus our own injectIntoDocument hook).
 *
 * Caveats:
 *
 *   - `PlatformState.getDocument()` returns the platform-level DOCUMENT
 *     bound at platform creation, NOT the per-request shim. Side-stepped
 *     by serializing our shim directly.
 *
 *   - `ServerPlatformLocation` is constructed once per platform from
 *     `INITIAL_CONFIG.url`. Anything reading `platformLocation.href`
 *     directly sees stale data; the Angular Router is unaffected because
 *     it gets the URL via the bootstrap context.
 */

import {
  APP_ID,
  ApplicationConfig,
  ApplicationRef,
  CSP_NONCE,
  PlatformRef,
  Renderer2,
  RendererFactory2,
  StaticProvider,
  Type,
  enableProdMode,
  ɵIS_HYDRATION_DOM_REUSE_ENABLED as IS_HYDRATION_DOM_REUSE_ENABLED,
  ɵSSR_CONTENT_INTEGRITY_MARKER as SSR_CONTENT_INTEGRITY_MARKER,
  ɵannotateForHydration as annotateForHydration,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  BEFORE_APP_SERIALIZED,
  INITIAL_CONFIG,
  platformServer,
  ɵSERVER_CONTEXT as SERVER_CONTEXT,
} from '@angular/platform-server';
import type { ServerContext } from '@analogjs/router/tokens';

import { provideServerContext } from './provide-server-context';
import {
  serverComponentRequest,
  renderServerComponent,
} from './server-component-render';
import {
  ShimDocument,
  createDocument,
  serializeDocument,
} from './ssr/dom-shim';
import { StringRendererFactory2V2 } from './ssr/string-renderer-v2';
import { resetComponentDefTViews } from './utils/reset-component-def-tviews';

if (import.meta.env.PROD) {
  enableProdMode();
}

const EVENT_DISPATCH_SCRIPT_ID = 'ng-event-dispatch-contract';
const DEFAULT_SERVER_CONTEXT = 'other';

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

      // Replicate platform-server's renderInternal pipeline.
      prepareForHydration(applicationRef, shimDocument);
      appendServerContextInfo(applicationRef);
      await runBeforeAppSerialized(applicationRef);

      return serializeDocument(shimDocument);
    } finally {
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

/**
 * Mirrors `prepareForHydration` from @angular/platform-server.
 *
 *   - Hydration disabled → strip the build-inlined event-dispatch script.
 *   - Hydration enabled  → append the integrity marker, run
 *     ɵannotateForHydration, then either insert the event-replay script
 *     or strip the dispatch script if there are no events to replay.
 */
function prepareForHydration(
  applicationRef: ApplicationRef,
  doc: ShimDocument,
): void {
  const env = applicationRef.injector;

  if (!env.get(IS_HYDRATION_DOM_REUSE_ENABLED, false)) {
    removeEventDispatchScript(doc);
    return;
  }

  appendSsrContentIntegrityMarker(doc);

  // ɵannotateForHydration walks the LView tree and writes ngh attributes
  // onto host elements via the renderer. Our StringRenderer routes those
  // writes either to the ShimElement (root host) or to ElementToken
  // attrs (everything else), so the markers land in the right places.
  const eventTypesToReplay = annotateForHydration(applicationRef, doc as any);

  if (eventTypesToReplay.regular.size || eventTypesToReplay.capture.size) {
    insertEventRecordScript(
      env.get(APP_ID),
      doc,
      eventTypesToReplay,
      env.get(CSP_NONCE, null),
    );
  } else {
    removeEventDispatchScript(doc);
  }
}

function appendSsrContentIntegrityMarker(doc: ShimDocument): void {
  const comment = doc.createComment(SSR_CONTENT_INTEGRITY_MARKER);
  if (doc.body.firstChild) {
    doc.body.insertBefore(comment, doc.body.firstChild);
  } else {
    doc.body.appendChild(comment);
  }
}

function removeEventDispatchScript(doc: ShimDocument): void {
  doc.getElementById(EVENT_DISPATCH_SCRIPT_ID)?.remove();
}

function insertEventRecordScript(
  appId: string,
  doc: ShimDocument,
  eventTypesToReplay: { regular: Set<string>; capture: Set<string> },
  nonce: string | null,
): void {
  const dispatchScript = doc.getElementById(EVENT_DISPATCH_SCRIPT_ID);
  if (!dispatchScript) return;

  const replayContents =
    `window.__jsaction_bootstrap(` +
    `document.body,` +
    `"${appId}",` +
    `${JSON.stringify(Array.from(eventTypesToReplay.regular))},` +
    `${JSON.stringify(Array.from(eventTypesToReplay.capture))}` +
    `);`;
  const replayScript = doc.createElement('script');
  replayScript.appendChild(doc.createTextNode(replayContents));
  if (nonce) replayScript.setAttribute('nonce', nonce);
  dispatchScript.after(replayScript);
}

/**
 * Mirrors `appendServerContextInfo` from @angular/platform-server.
 *
 * Sets `ng-server-context="..."` on each bootstrapped component's host
 * element, via that component's renderer (so attribute writes go through
 * our string renderer for ElementToken hosts and through the ShimElement
 * directly for the root host).
 */
function appendServerContextInfo(applicationRef: ApplicationRef): void {
  const serverContext = sanitizeServerContext(
    applicationRef.injector.get(SERVER_CONTEXT, DEFAULT_SERVER_CONTEXT),
  );
  for (const componentRef of applicationRef.components) {
    const renderer = componentRef.injector.get(Renderer2);
    const element = componentRef.location.nativeElement;
    if (element) {
      renderer.setAttribute(element, 'ng-server-context', serverContext);
    }
  }
}

function sanitizeServerContext(serverContext: string): string {
  const cleaned = serverContext.replace(/[^a-zA-Z0-9\-]/g, '');
  return cleaned.length > 0 ? cleaned : DEFAULT_SERVER_CONTEXT;
}

async function runBeforeAppSerialized(
  applicationRef: ApplicationRef,
): Promise<void> {
  const callbacks = applicationRef.injector.get(BEFORE_APP_SERIALIZED, null);
  if (!callbacks) return;
  const asyncCallbacks: Promise<unknown>[] = [];
  for (const cb of callbacks) {
    try {
      const result = cb();
      if (result) asyncCallbacks.push(result as Promise<unknown>);
    } catch (e) {
      console.warn('Ignoring BEFORE_APP_SERIALIZED Exception: ', e);
    }
  }
  if (asyncCallbacks.length) {
    for (const r of await Promise.allSettled(asyncCallbacks)) {
      if (r.status === 'rejected') {
        console.warn('Ignoring BEFORE_APP_SERIALIZED Exception: ', r.reason);
      }
    }
  }
}

function findAppRootSelector(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const customElMatch = bodyMatch[1].match(/<([a-z][a-z0-9]*-[a-z0-9-]*)/i);
    if (customElMatch) return customElMatch[1];
  }
  return 'app-root';
}
