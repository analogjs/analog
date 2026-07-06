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
import type { PlatformRef, ApplicationRef } from '@angular/core';
import type { ServerContext } from '@analogjs/router/tokens';
import { AsyncLocalStorage } from 'node:async_hooks';

import { provideServerContext } from './provide-server-context';
import { resetComponentDefTViews } from './utils/reset-component-def-tviews';
import { DEFER_RECONCILE_RUNTIME } from './defer-reconcile-runtime';

if (import.meta.env.PROD) {
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
  const g = globalThis as unknown as SsrStreamingGlobals;
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

function installCaptureDispatcher(): void {
  const g = globalThis as unknown as {
    __analogSsrDeferCapture?: DeferCaptureHandler & {
      __analogDispatcher?: boolean;
    };
  };
  if (g.__analogSsrDeferCapture?.__analogDispatcher) return;
  const dispatch = ((ev: DeferCaptureEvent) => {
    captureStore.getStore()?.(ev);
  }) as DeferCaptureHandler & { __analogDispatcher?: boolean };
  dispatch.__analogDispatcher = true;
  g.__analogSsrDeferCapture = dispatch;
}

let warnedMissingPrimitive = false;
function warnMissingPrimitiveOnce(): void {
  if (warnedMissingPrimitive || !import.meta.env.DEV) return;
  warnedMissingPrimitive = true;
  console.warn(
    '[@analogjs/router] renderStream: the streaming hook was not found on ' +
      '@angular/core, so rendering falls back to buffered. Enable ' +
      '`experimental.streaming` in your Analog config; if it already is, your ' +
      'installed Angular version may be incompatible with the streaming patch.',
  );
}

/** Byte offset just after the opening `<body>` tag, or 0 if none. */
function afterBodyOpen(html: string): number {
  const m = /<body[^>]*>/i.exec(html);
  return m ? m.index + m[0].length : 0;
}

/** Inner HTML of `<body>` from a fully rendered document string. */
function bodyInner(html: string): string {
  const start = afterBodyOpen(html);
  const end = html.lastIndexOf('</body>');
  return html.slice(start, end > -1 ? end : html.length);
}

/** Inner HTML of `<head>` from a fully rendered document string. */
function headInner(html: string): string {
  const open = /<head[^>]*>/i.exec(html);
  if (!open) return '';
  const start = open.index + open[0].length;
  const end = html.indexOf('</head>', start);
  return html.slice(start, end > -1 ? end : start);
}

/**
 * User agents that receive a fully buffered render (with a resolved `<head>`)
 * instead of the streamed shell. Streaming flushes the head before the app has
 * set a dynamic title/meta and reconciles it via a finalize script; a crawler
 * that does not run that script would index the shell's static head. Mirrors
 * Nuxt's bot bypass — streaming targets interactive clients, bots get the
 * buffered path whose head is byte-identical to the classic `render()`.
 */
const SSR_BOT_RE =
  /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegrambot|lighthouse|google-inspectiontool|headlesschrome|bingpreview/i;

function isLikelyBot(serverContext: ServerContext): boolean {
  const ua = serverContext?.req?.headers?.['user-agent'];
  return typeof ua === 'string' && SSR_BOT_RE.test(ua);
}

/**
 * Whether streaming is disabled for this request by a `streaming: false` route
 * rule. The platform plugin translates that rule into an `x-analog-no-streaming`
 * response header (mirroring how `ssr: false` becomes `x-analog-no-ssr`); when
 * present, `renderStream` produces the buffered `render()` output for this
 * route instead of streaming.
 */
function streamingDisabledByRoute(serverContext: ServerContext): boolean {
  return serverContext?.res?.getHeader?.('x-analog-no-streaming') === 'true';
}

/**
 * Serialize a `@defer` block's live domino subtree to HTML. Called a macrotask
 * after the block resolves, by which point change detection has filled in the
 * block's interpolations.
 */
function serializeLContainerHtml(lContainer: unknown): string {
  const g = globalThis as unknown as SsrStreamingGlobals;
  const collect = g.__analogSsrInternals?.collectNativeNodesInLContainer;
  if (!collect) return '';
  const nodes: any[] = [];
  collect(lContainer, nodes);
  let html = '';
  for (const n of nodes) html += n?.outerHTML ?? n?.data ?? n?.nodeValue ?? '';
  return html;
}

/** Destroy the platform on a macrotask, matching `renderApplication`. */
function asyncDestroyPlatform(platformRef: PlatformRef): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      platformRef.destroy();
      resolve();
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
  function bootstrap(context: BootstrapContext) {
    return bootstrapApplication(rootComponent, config, context);
  }

  return async function renderStream(
    url: string,
    document: string,
    serverContext: ServerContext,
  ): Promise<ReadableStream<Uint8Array>> {
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
      const html = await renderApplication(
        (context) => bootstrapApplication(rootComponent, config, context),
        {
          document,
          url,
          platformProviders: [
            provideServerContext(serverContext),
            platformProviders,
          ],
        },
      );
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(html as string));
          controller.close();
        },
      });
    }

    resetComponentDefTViews();

    installCaptureDispatcher();
    const encoder = new TextEncoder();

    // The stream is returned immediately; `start` fills it as the render
    // progresses, so the consumer receives the head, then each @defer block the
    // moment it resolves, then the authoritative tail — true streaming.
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const enqueue = (s: string) => controller.enqueue(encoder.encode(s));

        // The capture handler fires once per @defer block as it resolves. The
        // block's DOM is not filled until the next change-detection tick, so we
        // serialize + flush it a macrotask later — flushing DURING the render.
        // It is scoped to this render via async-local storage (see
        // installCaptureDispatcher) so concurrent renders never cross-talk.
        let blockIndex = 0;
        let capturing = true;
        const seen = new Set<unknown>();
        const pendingFlushes: Promise<void>[] = [];
        const onBlockResolved: DeferCaptureHandler = (ev) => {
          // A block can reach `Complete` more than once during a render; only
          // stream each container once. Also ignore any resolution that fires
          // after the render has moved on to serializing the authoritative tail.
          if (!capturing || seen.has(ev.lContainer)) return;
          seen.add(ev.lContainer);
          const id = `s${blockIndex++}`;
          pendingFlushes.push(
            new Promise<void>((resolve) => {
              setTimeout(() => {
                const html = serializeLContainerHtml(ev.lContainer);
                enqueue(
                  `<template data-analog-defer="${id}">${html}</template>` +
                    `<script>window.__analogPaint&&window.__analogPaint(${JSON.stringify(id)})</script>`,
                );
                resolve();
              }, 0);
            }),
          );
        };

        // Run the whole render inside the async-local context so every
        // change-detection tick and @defer resolution it schedules routes back
        // to THIS render's handler.
        await captureStore.run(onBlockResolved, async () => {
          const platformRef = platformServer([
            { provide: INITIAL_CONFIG, useValue: { document, url } },
            provideServerContext(serverContext),
            platformProviders,
          ]);

          // 1. Flush the head + reconcile runtime immediately (before the app is
          //    rendered), then open the live streaming region.
          enqueue(
            document.slice(0, afterBodyOpen(document)) +
              `<script>${DEFER_RECONCILE_RUNTIME}</script>` +
              `<div data-analog-stream></div>`,
          );

          let appRef: ApplicationRef | undefined;
          try {
            // 2. Bootstrap + render. Blocks resolve out of order during this
            //    phase and flush via the capture handler above.
            appRef = await bootstrap({ platformRef } as BootstrapContext);
            await appRef.whenStable();
            await Promise.all(pendingFlushes);
            // Stop capturing before serializing the tail so late resolutions
            // triggered by the hydration pass are not streamed as extra blocks.
            capturing = false;

            // 3. Flush the authoritative, fully hydration-annotated document as
            //    the tail. Carried in <template>s (their inert `ng-state`
            //    script survives). The app's resolved <head> ships alongside so
            //    a dynamically-set title/meta — set during render, after the
            //    shell head was already flushed — is reconciled onto the live
            //    document before the runtime swaps in the body and hydration
            //    boots.
            const authoritative = await renderInternal(platformRef, appRef);
            enqueue(
              `<template data-analog-head>${headInner(authoritative)}</template>` +
                `<template data-analog-authoritative>${bodyInner(authoritative)}</template>` +
                `<script>window.__analogReconcileHead&&window.__analogReconcileHead();` +
                `window.__analogFinalize&&window.__analogFinalize()</script>` +
                `</body></html>`,
            );
          } finally {
            await asyncDestroyPlatform(platformRef);
            controller.close();
          }
        });
      },
    });
  };
}
