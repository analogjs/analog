/**
 * Progressive streaming SSR renderer — EXPERIMENTAL.
 *
 * Returns a `ReadableStream<Uint8Array>` that flushes bytes DURING the render,
 * not after it:
 *   1. the document head + a client reconcile runtime are flushed immediately,
 *      before the app has finished rendering, so the browser starts fetching
 *      assets right away;
 *   2. each `@defer (hydrate …)` block's content is flushed the moment it
 *      resolves on the server — out of document order — while later blocks are
 *      still pending (proven: a slow block does not hold back an early one);
 *   3. once the app is stable, the authoritative, fully hydration-annotated
 *      document is flushed as the tail. This is byte-identical to a buffered
 *      `renderApplication`, and is what Angular's incremental hydration runs
 *      against on the client.
 *
 * Unlike a buffered renderer, this drives the platform directly
 * (`platformServer` + `bootstrapApplication` + `ɵrenderInternal`) so it can
 * interleave flushes with rendering. Angular's hydration annotation is
 * whole-document (the root's `ngh` index references every `@defer` container),
 * so the authoritative hydration payload is necessarily the tail: RENDERING
 * streams progressively, and hydration begins once the tail arrives.
 *
 * Depends on an upstream Angular per-block resolution hook exposed on two
 * globals (see {@link SsrStreamingGlobals}). When the primitive is absent,
 * `renderStream` degrades to a single buffered chunk so behaviour matches the
 * classic `render()` path, which is unchanged and remains the default.
 */
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
import {
  renderApplication,
  platformServer,
  INITIAL_CONFIG,
  ɵrenderInternal as renderInternal,
} from '@angular/platform-server';
import type { PlatformRef } from '@angular/core';
import type { ServerContext } from '../../tokens/src/index.js';
import { AsyncLocalStorage } from 'node:async_hooks';

import { provideServerContext } from './provide-server-context';
import { resetComponentDefTViews } from './utils/reset-component-def-tviews';
import { bodyInner, headInner } from './utils/stream-html';
import { createStreamShell } from './utils/stream-shell';
import { isLikelyBot, streamingDisabledByRoute } from './utils/stream-request';
import { DEFER_RECONCILE_RUNTIME } from './defer-reconcile-runtime';
import { createSsrStream } from './utils/ssr-stream-lifecycle';
import { createSsrNavigationTracker } from './ssr-navigation';

if (import.meta.env?.PROD) {
  enableProdMode();
}

/**
 * Shape of the upstream Angular streaming primitive we consume, published on
 * `globalThis` by the streaming-enabled `@angular/core` build (see the
 * `deferStreamingPlugin` in `@analogjs/platform`):
 *   - `__analogSsrDeferCapture` — the patched core invokes it once per resolved
 *     `@defer` block on the server, passing the block's live `lContainer`. We
 *     install a stable dispatcher here that routes to the current render (see
 *     `installCaptureDispatcher`).
 *   - `__analogSsrInternals.collectNativeNodesInLContainer` — collects a block's
 *     rendered root nodes so we can serialize them via domino `outerHTML`.
 */
interface SsrStreamingGlobals {
  __analogSsrDeferCapture?: (ev: {
    ssrUniqueId: string | null;
    lContainer: unknown;
  }) => void;
  __analogSsrInternals?: {
    collectNativeNodesInLContainer?: (
      lContainer: unknown,
      out: unknown[],
    ) => void;
  };
}

function streamingPrimitiveAvailable(): boolean {
  const g: typeof globalThis & SsrStreamingGlobals = globalThis;
  return (
    typeof g.__analogSsrInternals?.collectNativeNodesInLContainer === 'function'
  );
}

type DeferCaptureEvent = { ssrUniqueId: string | null; lContainer: unknown };
type DeferCaptureHandler = (ev: DeferCaptureEvent) => void;

/**
 * Per-render capture handlers live in async-local storage, not a single shared
 * global slot, so concurrent renders in one process do not clobber each other.
 * `globalThis.__analogSsrDeferCapture` is a stable dispatcher installed once; it
 * routes each resolved `@defer` block to the handler of the render whose async
 * context it fired in. A block that resolves outside any render (no store) is a
 * no-op.
 */
const captureStore = new AsyncLocalStorage<DeferCaptureHandler>();
const CAPTURE_ZONE_KEY = 'analogSsrDeferCapture';
interface CaptureZone {
  fork(spec: {
    name: string;
    properties: Record<string, DeferCaptureHandler>;
  }): CaptureZone;
  run<T>(callback: () => T): T;
  get(key: typeof CAPTURE_ZONE_KEY): DeferCaptureHandler | undefined;
}

function currentCaptureZone(): CaptureZone | undefined {
  const host: typeof globalThis & { Zone?: { current: CaptureZone } } =
    globalThis;
  return host.Zone?.current;
}

function runWithCapture<T>(handler: DeferCaptureHandler, render: () => T): T {
  const zone = currentCaptureZone();
  return captureStore.run(handler, () =>
    zone === undefined
      ? render()
      : zone
          .fork({
            name: 'analog-ssr-capture',
            properties: { [CAPTURE_ZONE_KEY]: handler },
          })
          .run(render),
  );
}

function installCaptureDispatcher(): void {
  const g: typeof globalThis & {
    __analogSsrDeferCapture?: DeferCaptureHandler & {
      __analogDispatcher?: boolean;
    };
  } = globalThis;
  if (g.__analogSsrDeferCapture?.__analogDispatcher) return;
  const dispatch: DeferCaptureHandler & { __analogDispatcher?: boolean } = (
    ev,
  ) => {
    const zoneHandler = currentCaptureZone()?.get(CAPTURE_ZONE_KEY);
    (zoneHandler ?? captureStore.getStore())?.(ev);
  };
  dispatch.__analogDispatcher = true;
  g.__analogSsrDeferCapture = dispatch;
}

let warnedMissingPrimitive = false;
function warnMissingPrimitiveOnce(): void {
  if (warnedMissingPrimitive || !import.meta.env?.DEV) return;
  warnedMissingPrimitive = true;
  console.warn(
    '[@analogjs/router] renderStream: the streaming hook was not found on ' +
      '@angular/core, so rendering falls back to buffered. Enable ' +
      '`experimental.streaming` in your Analog config; if it already is, your ' +
      'installed Angular version may be incompatible with the streaming patch.',
  );
}

/**
 * Serialize a `@defer` block's live domino subtree to HTML. Called a macrotask
 * after the block resolves, by which point change detection has filled in the
 * block's interpolations.
 */
function serializeLContainerHtml(lContainer: unknown): string {
  const g: typeof globalThis & SsrStreamingGlobals = globalThis;
  const collect = g.__analogSsrInternals?.collectNativeNodesInLContainer;
  if (!collect) return '';
  const nodes: {
    nodeType: number;
    outerHTML?: string;
    data?: string;
    nodeValue?: string;
  }[] = [];
  collect(lContainer, nodes);
  let html = '';
  for (const node of nodes) {
    if (node.nodeType === 1) html += node.outerHTML ?? '';
    else if (node.nodeType === 3)
      html += (node.data ?? node.nodeValue ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
  }
  return html;
}

/** Destroy the platform on a macrotask, matching `renderApplication`. */
function asyncDestroyPlatform(platformRef: PlatformRef): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        platformRef.destroy();
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 0);
  });
}

/**
 * Returns a function that renders a URL to a `ReadableStream<Uint8Array>`.
 *
 * Usage in main.server.ts:
 * ```ts
 * import { renderStream } from '@analogjs/router/server';
 * export default renderStream(App, config);
 * ```
 */
export function renderStream(
  rootComponent: Type<unknown>,
  config: ApplicationConfig,
  platformProviders: Provider[] = [],
) {
  return async function renderStream(
    url: string,
    document: string,
    serverContext: ServerContext,
  ): Promise<ReadableStream<Uint8Array>> {
    serverContext.signal?.throwIfAborted();
    const navigation = createSsrNavigationTracker();
    const applicationConfig = {
      ...config,
      providers: [...config.providers, navigation.provider],
    };
    const bootstrap = (context: BootstrapContext) =>
      bootstrapApplication(rootComponent, applicationConfig, context);
    // Reset before every render — both the buffered fallback below and the
    // streaming path — so a prior render's locale/consts are not frozen for the
    // process lifetime (parity with render.ts).
    resetComponentDefTViews();

    // Fall back to a single buffered chunk so output matches the classic path
    // for:
    //   - crawlers, which may not run the finalize script that reconciles a
    //     dynamic <head>, so they get a buffered render with a resolved head;
    //   - routes with a `streaming: false` rule (opt out per route);
    //   - a missing streaming primitive.
    const primitiveAvailable = streamingPrimitiveAvailable();
    const bot = isLikelyBot(serverContext);
    const routeDisabled = streamingDisabledByRoute(serverContext);
    if (bot || routeDisabled || !primitiveAvailable) {
      // Warn only when the primitive is genuinely absent — the bot and
      // route-opt-out paths fall back to buffered by design, not by degradation.
      if (!bot && !routeDisabled && !primitiveAvailable) {
        warnMissingPrimitiveOnce();
      }
      const html = await renderApplication(bootstrap, {
        document,
        url,
        platformProviders: [
          provideServerContext(serverContext),
          platformProviders,
        ],
      });
      navigation.throwIfFailed();
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(html as string));
          controller.close();
        },
      });
    }

    installCaptureDispatcher();
    const platformRef = platformServer([
      { provide: INITIAL_CONFIG, useValue: { document, url } },
      provideServerContext(serverContext),
      platformProviders,
    ]);

    let shell: string;
    try {
      shell = createStreamShell(platformRef);
    } catch (error) {
      await asyncDestroyPlatform(platformRef);
      throw error;
    }

    return createSsrStream({
      signal: serverContext.signal,
      waitUntil: serverContext.waitUntil,
      errorHtml: serverContext.renderErrorsAsHtml
        ? '<script data-analog-error>window.__analogFail&&window.__analogFail();</script></body></html>'
        : undefined,
      destroy: () => asyncDestroyPlatform(platformRef),
      async render(writer) {
        let blockIndex = 0;
        const seen = new Set<unknown>();
        const onBlockResolved: DeferCaptureHandler = (event) => {
          if (!writer.active || seen.has(event.lContainer)) return;
          seen.add(event.lContainer);
          const id = `s${blockIndex++}`;
          writer.scheduleBlock(
            () =>
              `<template data-analog-defer="${id}">${serializeLContainerHtml(event.lContainer)}</template>` +
              `<script>window.__analogPaint&&window.__analogPaint(${JSON.stringify(id)})</script>`,
          );
        };

        await runWithCapture(onBlockResolved, async () => {
          writer.enqueue(
            shell +
              `<script>${DEFER_RECONCILE_RUNTIME}</script>` +
              '<div data-analog-stream></div>',
          );
          const appRef = await bootstrap({ platformRef });
          if (!writer.active) return;
          await appRef.whenStable();
          if (!writer.active) return;
          navigation.throwIfFailed();
          await writer.finishBlocks();
          if (!writer.active) return;
          const authoritative = await renderInternal(platformRef, appRef);
          navigation.throwIfFailed();
          writer.enqueue(
            `<template data-analog-head>${headInner(authoritative)}</template>` +
              `<template data-analog-authoritative>${bodyInner(authoritative)}</template>` +
              '<script>window.__analogReconcileHead&&window.__analogReconcileHead();' +
              'window.__analogFinalize&&window.__analogFinalize()</script></body></html>',
          );
        });
      },
    });
  };
}
