# RFC: Streaming SSR primitives for meta-frameworks

**Target:** `angular/angular` (`@angular/platform-server`, `@angular/core` hydration, `@angular/ssr`)
**Status:** Draft — for submission as an Angular RFC discussion
**Author:** Brandon Roberts (AnalogJS)
**Date:** 2026-08-17
**Prior art in this repo:** [`RFC-streaming-ssr.md`](./RFC-streaming-ssr.md) (the shipped Analog prototype this RFC generalizes)

---

## Summary

Angular's server renderer is **fully buffered**: `renderApplication` renders the
whole app into a server DOM, awaits `ApplicationRef.whenStable()`, annotates the
entire document for hydration, and resolves a single `string`. Nothing reaches
the browser until the slowest `@defer (hydrate …)` block resolves.

Incremental hydration (stable since v20, on by default with
`provideClientHydration()` in v22) already renders `@defer (hydrate …)` blocks
eagerly on the server and marks them as independent hydration boundaries. Those
boundaries are exactly the shape a streaming renderer needs — the content exists
in the server DOM long before `whenStable()`, and the client already knows how
to hydrate each block in isolation. The only thing missing is a way to **get
each block out of the server while the render is still running**.

This RFC asks Angular for that capability as public API, in two layers:

- **Layer 1 — a chunk source.** An async sequence of render chunks (shell,
  per-block, tail), where each block chunk arrives when the block resolves and
  carries its own hydration annotation. The host framework owns transport and
  framing.
- **Layer 2 — a turnkey stream.** `renderApplicationStream(...)` built on
  Layer 1, returning a `ReadableStream<Uint8Array>` for app authors and for
  `@angular/ssr`.

Analog has built and shipped an experimental streaming renderer that
demonstrates the design and quantifies the payoff (**TTFB 608 ms → 3 ms, FCP
648 ms → 200 ms** on a throttled production build). It works by string-patching
`@angular/core`'s compiled FESM at build time, anchored on private symbol names.
That patch is a proof of demand, not a durable mechanism. **The ask is to
replace it with API.**

## Why this belongs in Angular

Three of the four pieces a streaming renderer needs are things only Angular can
provide correctly, because they are properties of the hydration contract rather
than of the transport:

1. **Knowing when a `@defer` block has resolved on the server.** This lives
   inside `applyDeferBlockState` in `@angular/core`.
2. **Serializing one block's subtree.** Requires walking the block's
   `LContainer` to its rendered root nodes.
3. **Annotating that one block for hydration, with an id the final
   whole-document pass agrees with.** `annotateForHydration(appRef, doc)`
   operates on the whole `ApplicationRef` and assigns defer-block ids by
   insertion order (`` const deferBlockId = `d${context.deferBlocks.size}` ``).
   A block annotated early and the same block annotated in the final pass must
   agree, or hydration breaks.

Only the fourth — HTTP framing, chunked responses, route-level opt-outs, crawler
policy — belongs to the framework. Analog is happy to own that part; it cannot
correctly own the first three, and neither can any other meta-framework. Every
one of them will otherwise reimplement the same patch against the same private
symbols, and each Angular minor release becomes a coordination event.

There is also a direct win for Angular's own stack: `@angular/ssr`'s request
handler returns a `Response`, whose body can be a stream. Layer 2 would let
Angular ship streaming SSR to Angular CLI applications with no change to the
public shape of that handler.

## Background: what buffered rendering does today

Verified against `packages/platform-server/src/utils.ts` on `main`:

```ts
export async function renderInternal(
  platformRef: PlatformRef,
  applicationRef: ApplicationRef,
): Promise<string> {
  const platformState = platformRef.injector.get(PlatformState);
  prepareForHydration(platformState, applicationRef); // whole-document
  appendServerContextInfo(applicationRef);
  // … BEFORE_APP_SERIALIZED callbacks …
  return platformState.renderToString(); // one string, once
}
```

and `prepareForHydration`:

```ts
appendSsrContentIntegrityMarker(doc);
const eventTypesToReplay = annotateForHydration(applicationRef, doc);
if (eventTypesToReplay.regular.size || eventTypesToReplay.capture.size) {
  insertEventRecordScript(appId, doc, eventTypesToReplay, nonce);
}
```

Five consequences, each of which becomes a requirement below:

| Today                                                            | Consequence for streaming                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `renderApplication` awaits `whenStable()` before returning bytes | TTFB is bounded by the slowest `@defer` block, including `<head>` and CSS |
| `annotateForHydration` is whole-document                         | No block can be sent hydration-ready before the last block resolves       |
| Defer ids are assigned by insertion order during one traversal   | An incrementally annotated block cannot be given a stable, agreed id      |
| `insertEventRecordScript` runs at the tail                       | Content painted early cannot capture events for replay                    |
| `TransferState` is serialized once, into `ng-state` at the tail  | Per-block data resolved early cannot ship with the block                  |

## What Analog built, and what it cost

The prototype (`renderStream` in `@analogjs/router/server`, plus a Vite plugin in
`@analogjs/platform`) drives the platform directly — `platformServer` +
`bootstrapApplication` + `ɵrenderInternal` — so it can interleave flushes with
rendering:

1. flush the shell `<head>` + a small client runtime immediately;
2. flush each `@defer (hydrate …)` block the moment it resolves, out of document
   order, into a preview region;
3. after `whenStable()`, call `ɵrenderInternal` for the authoritative,
   fully-annotated document and flush it as the tail; the client runtime
   reconciles the head and swaps in the authoritative body before hydration
   boots.

To get signal (1) it patches two anchors into `@angular/core`'s SSR bundle:

- inside `applyDeferBlockState`, next to
  `profiler(ProfilerEvent.DeferBlockStateEnd);`, invoke a global with the
  resolved block's `lContainer`;
- expose `collectNativeNodesInLContainer` on a global so the renderer can
  serialize that block's subtree.

**Results** (throttled Chromium, production build, ~600 ms data dependency,
median of 9; full method in [`RFC-streaming-ssr.md`](./RFC-streaming-ssr.md)):

| Metric | Streamed   | Buffered |
| ------ | ---------- | -------- |
| TTFB   | **3 ms**   | 608 ms   |
| FCP    | **200 ms** | 648 ms   |
| LCP    | 660 ms     | 648 ms   |
| CLS    | 0.006      | 0.000    |

**And the costs, all of which trace directly to missing API:**

- **+100% bytes.** Because a block cannot be annotated for hydration on its own,
  every block ships twice — once as an unannotated progressive preview, once
  inside the authoritative tail.
- **LCP is a wash.** The eager (non-`@defer`) shell is only hydration-annotated
  in the whole-document pass, so it ships in the tail. The LCP element waits on
  `whenStable()` exactly as before.
- **CLS regression, small but real.** The tail replaces the whole `<body>` in one
  `replaceChildren` to guarantee the DOM hydration runs against is byte-identical
  to a buffered render. Painting in place would avoid the swap entirely.
- **No event replay before the tail.** Progressively painted content is visible
  but its events are not captured, because `insertEventRecordScript` has not run.
- **Angular ≥ 21 only, and brittle.** v20's compiled FESM inlines
  `ProfilerEvent.DeferBlockStateEnd` to a numeric ordinal, so the anchor does not
  match. The plugin has to classify each `@angular/core` module and warn on
  drift, because a renamed internal silently degrades streaming to buffered.

A single-send variant was also prototyped and validated (hydrates identically to
buffered) and brings the byte cost from +100% to **+24%**, with the residual
being streaming scaffolding rather than duplicated content. It was **not
shipped**, deliberately: it edits the middle of `serializeLContainer` and depends
on several more private symbols (`SerializedViewCollection`,
`isIncrementalHydrationEnabled`, `IS_EVENT_REPLAY_ENABLED`, …). That is past the
line where a framework-carried string patch is defensible — and it is precisely
the design this RFC proposes Angular adopt as API.

## Requirements

Five capabilities, ordered by how much they unlock. R1–R3 are the substance; R4
and R5 remove the remaining correctness gaps.

### R1 — A per-`@defer`-block server resolution signal

**Missing:** any public notification that a `@defer` block reached its complete
state during SSR.

**Today:** a build-time string patch inside `applyDeferBlockState`, gated on
`ngServerMode`.

**Needed:** a documented, server-only notification carrying enough identity to
address the block later — at minimum its SSR unique id, and the fact that it is
now renderable. It must fire per block, as it resolves, before `whenStable()`.

Concurrency note: the patch's global entry point forced Analog to install a
process-wide dispatcher and route each event to the owning render with
`AsyncLocalStorage`. **A per-render subscription surface avoids that entirely**
and is the shape we would ask for — the signal should hang off the render
operation, not `globalThis`.

### R2 — Serialize a single block's rendered subtree

**Missing:** a public way to obtain the HTML for one `@defer` block's rendered
root nodes. `platformState.renderToString()` is whole-document only.

**Today:** private `collectNativeNodesInLContainer` + `outerHTML` per node,
called a macrotask after resolution so change detection has filled
interpolations. That timing dependency is guesswork on our side; Angular knows
exactly when a block's DOM is settled.

**Needed:** serialization scoped to a resolved block, emitted at a point where
its content is final.

### R3 — Incremental hydration annotation with stable block ids

This is the load-bearing request; R1 and R2 without it only buy the
double-send design Analog already ships.

**Missing:** the ability to annotate one resolved block for hydration —
its `ngh` payload, `jsaction` attributes, and block markers — such that:

- the block can be streamed **once**, already hydration-ready;
- the tail is the shell with block content replaced by slot markers;
- ids assigned incrementally and ids assigned by the final whole-document pass
  **agree**, since blocks now become addressable in resolution order rather than
  traversal order.

**Today:** impossible without editing `serializeLContainer`'s id assignment,
which the unshipped single-send prototype did (memoize the id per container when
streaming is active, instead of `` `d${context.deferBlocks.size}` ``).

**Needed:** either a public per-block annotate operation, or an internal
restructuring of `annotateForHydration` so incremental and final annotation share
an id allocator. The second is likely the smaller change on Angular's side, and
is a precondition for the first regardless.

### R4 — Incremental transfer state

**Missing:** a way to emit the `TransferState` accumulated so far, so a block
that resolved from an `httpResource` ships its data with it. Today
`annotateForHydration` writes into `TransferState` and the whole thing serializes
into one `ng-state` script at the tail.

**Needed:** either per-chunk state deltas with defined merge semantics on the
client, or an explicit statement that transfer state remains tail-only and
frameworks must not depend on early data being available. Either answer is
workable; the ambiguity is not.

### R5 — Early event-replay bootstrap

**Missing:** event capture for content that is visible before the tail arrives.
`insertEventRecordScript` runs inside `prepareForHydration`, so a user who clicks
a progressively painted block gets nothing replayed.

**Needed:** the event-dispatch contract bootstrapped in the **first** chunk, with
the replayable event-type sets either declared up front or extended per chunk.
This is the difference between streaming being a paint optimization and streaming
being an interaction optimization.

## Proposed API

The organizing principle: **Angular owns chunk content and hydration semantics;
the host framework owns transport, framing, and policy.** Analog does not want
Angular to sniff user agents, set `Transfer-Encoding`, or know about route
rules — and Angular should not have to.

### Layer 1 — chunk source (what Analog needs)

```ts
// @angular/platform-server

export type ServerRenderChunk =
  | { kind: 'shell'; html: string }
  | { kind: 'block'; blockId: string; html: string; slot: string }
  | { kind: 'tail'; html: string };

export function renderApplicationChunks(
  bootstrap: (context: BootstrapContext) => Promise<ApplicationRef>,
  options: {
    document?: string | Document;
    url?: string;
    platformProviders?: Provider[];
    allowedHosts?: readonly string[];
  },
): AsyncIterable<ServerRenderChunk>;
```

Semantics we would rely on:

- **`shell`** is emitted before the app is stable and contains everything known
  up front: the document up to the app root, the event-dispatch bootstrap (R5),
  and whatever client runtime Angular needs for mounting.
- **`block`** is emitted per `@defer (hydrate …)` block as it resolves (R1),
  in resolution order, containing that block's fully annotated HTML (R2, R3) and
  the `slot` marker identifying where it belongs in the tail.
- **`tail`** is emitted after `whenStable()`: the authoritative document with
  resolved `<head>`, block content replaced by slot markers, transfer state, and
  the content-integrity marker.
- Consuming the iterable is the render; abandoning it destroys the platform.
- A rejection surfaces as an iterator rejection, after which the framework
  decides what to do with a response whose headers are already committed.

Analog's `renderStream` becomes a thin adapter: encode each chunk, hand the
`ReadableStream` to Nitro, and keep the existing route-rule and crawler policy in
the framework where it belongs. The `deferStreamingPlugin`, the global
dispatcher, the `AsyncLocalStorage` routing, the macrotask timing guess, and the
version gate all delete.

### Layer 2 — turnkey stream (for app authors and `@angular/ssr`)

```ts
export function renderApplicationStream(
  bootstrap: (context: BootstrapContext) => Promise<ApplicationRef>,
  options: {
    /* same options as renderApplication */
  },
): ReadableStream<Uint8Array>;
```

Built on Layer 1, emitting Angular's own mounting runtime so blocks land in their
final document position as they arrive — no preview region, no body swap, no CLS
cost. `renderApplication` stays exactly as it is; this is purely additive.

### Ownership boundary

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant F as "Framework (Analog / @angular/ssr)"
    participant A as "Angular (renderApplicationChunks)"

    F->>A: renderApplicationChunks(bootstrap, options)
    A-->>F: chunk { kind: 'shell' }
    F-->>B: framed bytes (chunked TE / Response body)
    Note over B: assets fetch; event capture already armed (R5)

    loop each @defer block, as it resolves
        A-->>F: chunk { kind: 'block', blockId, html, slot }
        F-->>B: framed bytes
        Note over B: block paints into its slot, hydration-ready (R3)
    end

    A-->>F: chunk { kind: 'tail' }
    F-->>B: framed bytes
    Note over B: incremental hydration boots
```

## Semantics Angular would need to define

These are the questions the prototype had to answer by guessing. Framework
authors will answer them differently, and inconsistently, unless Angular states
them.

**Head and title.** The shell `<head>` flushes before the app runs, so a
`Title`/`Meta` value set during render is not yet known. Analog streams the
authoritative head in the tail and reconciles it onto the live document before
hydration — the same late-patch strategy Nuxt uses — and routes crawlers to the
buffered path so bots see a resolved head without executing a script. If Angular
owns Layer 2, it owns this behavior; if it only owns Layer 1, it should still say
which chunk the resolved head belongs to.

**Error after commit.** Once the shell is flushed the status line is spent.
Analog errors the stream (rather than closing silently, which hands the client a
truncated non-hydratable 200) and logs how many blocks made it out. Angular
should specify whether a failed render appends a marker the client runtime can
detect, or whether transport-level truncation is the whole contract.

**Ordering.** Analog streams blocks in resolution order into a preview region and
relies on the tail for final position. With in-place slots (Layer 2), resolution
order is a paint-order detail and document order is preserved structurally —
worth stating explicitly, since it is the property that makes out-of-order
streaming safe.

**Zoneless.** `whenStable()` is whole-app. Per-block resolution in a zoneless app
depends on `PendingTasks` bookkeeping being scoped enough to know when _this_
block's async work is done. Whether that is already true, or needs work, is a
question for the team.

**CSP.** Any mounting or bootstrap script Angular emits needs `CSP_NONCE`
threaded through, as `insertEventRecordScript` already does.

## Alternatives considered

**Keep the string patch.** What Analog ships today. Works, measurably helps, and
is unsustainable: it anchors on private symbol names, needs per-module drift
detection to avoid silent degradation, is pinned to Angular ≥ 21 by an inlined
enum ordinal, and cannot reach single-send without depending on several more
internals. Every meta-framework that wants streaming writes this patch
independently.

**Fork or vendor `platform-server`.** Removes the drift detection but multiplies
the maintenance and guarantees divergence from Angular's hydration contract — the
one thing that must not diverge.

**Client-only deferral instead of streaming.** Send a shell fast and let the
client fetch block content. This is a different product: it gives up server
rendering for that content, hurts LCP for above-the-fold blocks, and abandons the
crawler story. `@defer (hydrate …)` exists precisely so heavy subtrees _are_
server-rendered.

**Solve it only in `@angular/ssr`.** Would ship streaming to CLI apps and leave
Vite-based meta-frameworks — Analog and anything after it — back at the string
patch. Layer 1 in `platform-server` serves both; `@angular/ssr` becomes its first
consumer.

**Do nothing.** Buffered SSR keeps TTFB coupled to the slowest data dependency in
the page. In the measured app that is a 605 ms difference in first byte and a
448 ms difference in first paint, on a route whose only sin is one slow
`httpResource`.

## Compatibility

Entirely additive. `renderApplication`, `renderModule`, and `renderInternal` keep
their signatures and behavior; buffered rendering stays the default and the only
path for prerendering/SSG. Frameworks opt in per render, and can fall back to
buffered per request — as Analog already does for crawlers and for routes with
streaming disabled. R3 is the only requirement that touches existing internals
(defer-block id allocation), and it is unobservable to a buffered render as long
as the final pass keeps assigning ids for blocks that were never annotated early.

## Open questions for the Angular team

1. **`platform-server` or `@angular/ssr`?** Layer 1 seems to belong in
   `platform-server` next to `renderApplication`; Layer 2 could live in either.
2. **Is per-block annotation (R3) reachable**, or is a shared id allocator
   between incremental and final passes the realistic first step?
3. **Transfer state (R4)** — per-chunk deltas, or tail-only by contract?
4. **Event replay (R5)** — can the replayable event-type sets be known or
   extended incrementally, or must the contract script be conservative in the
   shell?
5. **Zoneless per-block stability** — does `PendingTasks` already give a
   block-scoped answer?
6. **Would Angular want the mounting runtime** (Layer 2) as public, documented
   output, so frameworks that build their own transport still share one client
   contract?
7. **Is there appetite for streaming the eager shell early** as well — the
   remaining reason LCP does not improve in our measurements?

## Appendix: prototype references

All in [`analogjs/analog`](https://github.com/analogjs/analog):

| Piece                                   | Path                                                            |
| --------------------------------------- | --------------------------------------------------------------- |
| Streaming renderer                      | `packages/router/server/src/render-stream.ts`                   |
| Client reconcile runtime                | `packages/router/server/src/defer-reconcile-runtime.ts`         |
| `@angular/core` patch + drift detection | `packages/platform/src/lib/ssr/defer-streaming-plugin.ts`       |
| Nitro streaming handler                 | `packages/vite-plugin-nitro/src/lib/utils/renderers.ts`         |
| End-to-end app + CWV benchmark          | `apps/streaming-app`, `apps/streaming-app/tools/cwv-bench.mjs`  |
| Full design + measurements              | `packages/router/RFC-streaming-ssr.md`                          |
| User-facing docs                        | `apps/docs-analog/src/content/features/server/streaming-ssr.md` |

Angular internals the prototype depends on today, and the requirement that would
retire each:

| Internal                                                    | Used for                           | Retired by |
| ----------------------------------------------------------- | ---------------------------------- | ---------- |
| `applyDeferBlockState` / `ProfilerEvent.DeferBlockStateEnd` | per-block resolution signal        | R1         |
| `collectNativeNodesInLContainer`                            | block subtree serialization        | R2         |
| `ɵrenderInternal`                                           | authoritative tail                 | Layer 1    |
| `serializeLContainer` id assignment                         | single-send annotation (unshipped) | R3         |
