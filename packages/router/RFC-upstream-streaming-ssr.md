# RFC: First-class streaming SSR primitives for Angular

**Audience:** Angular team (`@angular/core`, `@angular/platform-server`)
**Status:** Draft — for submission to angular/angular as an RFC discussion
**Authors:** Brandon Roberts (AnalogJS)
**Date:** 2026-08-17
**Prior art in this repo:** [RFC: Progressive Streaming SSR (`renderStream`)](./RFC-streaming-ssr.md) — the working Analog prototype this proposal is distilled from

---

## Summary

Angular's server rendering pipeline is fully buffered: `renderApplication`
renders the entire app, waits for every `@defer (hydrate …)` block to resolve,
annotates the whole document for hydration, and only then returns a single
string. Time-to-first-byte is therefore bounded by the slowest dependency on
the page, and nothing — not even the `<head>` — reaches the browser before the
last block resolves.

AnalogJS has built and validated a progressive streaming SSR renderer on top of
today's Angular. It works, and the measured wins are large (TTFB 608 ms → 3 ms,
FCP 648 ms → 200 ms on a throttled benchmark). But it only works by
**string-patching private symbols in `@angular/core`'s compiled FESM output**,
because Angular exposes no supported seam for any of it. That is not a durable
foundation — the anchors already broke once between v20 and v21 — and the
capability rightfully belongs in the framework.

This RFC proposes that Angular expose streaming SSR primitives in three tiers,
each independently useful and each validated by the Analog prototype:

1. **Tier 1 — a per-`@defer`-block server resolution event** with a supported
   way to serialize the resolved block's subtree. This is the minimal seam; it
   enables out-of-order progressive streaming built outside core.
2. **Tier 2 — per-block incremental hydration annotation with stable block
   ids**, so a streamed block ships exactly once, already carrying its
   `ngh`/`jsaction` annotations, instead of being re-sent in an authoritative
   tail.
3. **Tier 3 — a first-class `renderApplicationStream` in
   `@angular/platform-server`** that composes tiers 1–2 into a supported
   renderer returning a `ReadableStream<Uint8Array>`.

Tiers 1 and 2 are additive, and they are the same primitives an
`@angular/ssr` streaming renderer would need internally — this RFC is offered
as input to Angular's own streaming plans, not as a parallel track. They are
most coherent landing together (Tier 1 in isolation blesses a double-send
pattern; see the Tier 1 discussion), with Tier 3 following once the primitives
have proven out.

## Motivation

### The buffered pipeline wastes the work `@defer` already does

With incremental hydration (stable since v20), `@defer (hydrate …)` blocks are
rendered **eagerly on the server**. Their HTML exists in the server DOM long
before `ApplicationRef.whenStable()` — but the buffered pipeline holds all of
it until the slowest block resolves, then serializes once. The framework
already produces content progressively; it just cannot flush progressively.

Consequences, measured on the Analog prototype's benchmark app (one route, a
~600 ms `httpResource` dependency behind a `@defer` block, Chromium under
Slow-4G / 4× CPU throttling, median of 9 runs):

| Metric       | Buffered (today) | Streamed (prototype)                                         |
| ------------ | ---------------- | ------------------------------------------------------------ |
| TTFB         | 608 ms           | **3 ms**                                                     |
| FCP          | 648 ms           | **200 ms**                                                   |
| LCP          | 648 ms           | 660 ms (wash — see [Lessons](#what-the-prototype-taught-us)) |
| CLS          | 0.000            | 0.006 (both "good")                                          |
| Fully loaded | 2434 ms          | 1996 ms                                                      |

The browser cannot begin fetching CSS/JS until the first byte arrives, so the
buffered wait compounds: it delays first byte, first paint, _and_ asset fetch.
Streaming flushes the `<head>` immediately and paints each block as it
resolves; completion time is unchanged (streaming adds negligible CPU).

### Ecosystem parity

React (`renderToPipeableStream` / `renderToReadableStream`, out-of-order
Suspense streaming since v18), Vue/Nuxt (`renderToWebStream` plus streamed head
patches as Suspense boundaries resolve), Solid, and Marko all ship streaming
server renderers as first-class API. Angular — with `@defer` + incremental
hydration — is the framework whose component model is _already_ shaped like
streaming boundaries, without a way to flush them. The change is confined
entirely to the server side. Streaming SSR has also appeared on Angular's own
public roadmap as an area of exploration; this proposal is intended to feed
that work with a validated design and measurements, not to compete with it.

### The current workaround is the wrong long-term owner

The Analog prototype obtains the needed seams via a Vite plugin that patches
`@angular/core` during SSR builds:

- it injects a callback inside `applyDeferBlockState`, anchored on the
  `profiler(ProfilerEvent.DeferBlockStateEnd)` call, firing when a block
  reaches `Complete` under `ngServerMode`;
- it exposes the internal `collectNativeNodesInLContainer` so the renderer can
  serialize a resolved block's subtree.

This is append-only and anchor-guarded, with drift detection that warns rather
than silently degrading — as careful as an out-of-tree patch can be. It is
still a patch against private, non-minified FESM symbol names. The v20 → v21
FESM change (inlining the profiler event ordinal) already shifted the anchor
once; the Tier 2 prototype additionally reaches `serializeLContainer`,
`SerializedViewCollection`, `isIncrementalHydrationEnabled`, and
`IS_EVENT_REPLAY_ENABLED`. A capability that meta-frameworks demonstrably want,
and that touches this much of core's hydration machinery, should be a supported
contract, not a string transform.

## Proposal

### Tier 1 — per-block server resolution events (minimal, additive)

A server-only, opt-in hook that fires as each `@defer` block completes during
SSR, with a supported handle for serializing the block's rendered subtree.

**Scope.** The event exists only for blocks the server renders to completion —
`@defer (hydrate …)` blocks under `withIncrementalHydration()`. A plain
`@defer` block renders its placeholder on the server and never reaches
`Complete` there, so it never fires; without incremental hydration enabled the
feature is inert and buffered rendering is unaffected.

Sketch (naming illustrative):

```ts
// @angular/platform-server
export interface DeferBlockSsrEvent {
  /** Stable block id — identical to the id used in hydration annotation. */
  readonly id: string;
  /**
   * Serialized HTML of the block's rendered subtree. Resolves after the
   * render pass that fills the block's bindings (see Timing).
   */
  serialize(): Promise<string>;
}

export function provideDeferBlockSsrEvents(
  onBlockComplete: (event: DeferBlockSsrEvent) => void,
): Provider;

// usage
renderApplication(bootstrap, {
  document,
  url,
  platformProviders: [
    provideDeferBlockSsrEvents((block) => {
      /* flush block to the response */
    }),
  ],
});
```

Design points, each learned the hard way in the prototype:

- **DI-scoped, not process-global.** The prototype's patched core can only call
  a `globalThis` function, forcing an `AsyncLocalStorage` dispatcher to keep
  concurrent renders in one process from cross-talking. A provider- or
  option-scoped callback is naturally per-render and eliminates this entire
  class of bug — and works on runtimes without `node:async_hooks`.
- **Timing contract: serialize after bindings are filled.** A block's DOM is
  not populated at the moment it reaches `Complete`; interpolations fill on the
  following change-detection pass. The prototype approximates this by
  serializing one macrotask later — but a macrotask is a scheduler
  implementation detail, not a contract, and is exactly the kind of timing that
  shifts under the zoneless scheduler. The API should define the point against
  the defer state machine itself: `serialize()` resolves after the render pass
  that completes the block's transition to `Complete` — the same "after
  render" point `afterNextRender` observes — so consumers never reason about
  task queues.
- **Fire once per block.** A block can re-enter `Complete` during a render; the
  event should be de-duplicated by the framework, not by every consumer.
- **Zoneless-compatible.** The event derives from the defer state machine, not
  Zone.js; the prototype runs identically under zone and zoneless apps.
- **No contract on the server DOM implementation.** `serialize()` promises
  markup, not any particular DOM emulation — platform-server stays free to
  change how the server DOM is produced (a live concern given domino's
  maintenance status).

Tier 1 alone enables real streaming: Analog's shipping prototype uses exactly
this seam (plus a whole-document tail for hydration, see Tier 2) and delivers
the TTFB/FCP numbers above. It is, however, also a pattern Angular may not
want to bless in isolation: Tier 1 without Tier 2 means double-send plus a
finalize body-swap, permanently, in every consumer. If that argues for landing
Tiers 1 and 2 together — with plain `serialize()` perhaps never becoming
public once `annotate()` exists — that ordering works equally well for
meta-frameworks. The tiers are separated here to sequence the design
discussion, not to demand three separate releases.

### Tier 2 — per-block hydration annotation with stable ids

With Tier 1 only, hydration remains whole-document: the root component's `ngh`
index references every `@defer` container, so the authoritative
hydration-annotated document can only be produced at `whenStable`. A streaming
renderer must therefore ship each block twice — a progressive preview during
render, and the authoritative copy in the tail. On the prototype's benchmark
that doubles the payload (3716 → 7439 bytes, **+100%**).

Tier 2 removes the double-send with two changes to core's serialization,
both prototyped and validated (streamed single-send documents hydrate
identically to buffered, 5/5 e2e):

1. **Stable, resolution-order block ids.** Today `serializeLContainer` assigns
   defer-block ids as `d${deferBlocks.size}` at whole-document serialization
   time. When streaming, the id must be memoized per container at first
   assignment, so the id a block streams under and the id the final document
   (and transfer state) reference are the same.
2. **A per-block annotator.** A supported entry point that runs core's own
   `serializeLContainer` machinery over a single resolved block, returning its
   HTML _with_ `ngh`/`jsaction` annotation attached, plus that block's
   contribution to the hydration transfer state:

```ts
export interface DeferBlockSsrEvent {
  readonly id: string;
  serialize(): Promise<string>; // Tier 1: plain HTML
  annotate(): Promise<{ html: string; state: SerializedDeferBlockState }>; // Tier 2
}
```

The renderer then streams each block once, already annotated, and the tail
shrinks to the eager shell (with slot markers where streamed blocks mount) plus
the accumulated transfer state. Measured on the same benchmark: **+24%** over
buffered instead of +100%, and the residual is fixed per-block scaffolding that
amortizes as block content grows.

One part of the contract deserves explicit specification rather than being
left as an implementation detail: the root component's own annotation —
serialized in the tail — must reference blocks that were annotated and
streamed earlier. The exact shape of `SerializedDeferBlockState`, and the
merge rule between per-block state, the root's tail annotation, and the
document's single transfer-state script, are therefore part of Tier 2's API
surface (see open questions).

> **TODO (measurement):** the byte figures here and in the supporting material
> are uncompressed. The double-send's second copy is near-identical to the
> first and therefore compresses unusually well, so the wire-size gap between
> +100% and +24% will be narrower under gzip/brotli than the raw numbers
> suggest. Both designs should be re-measured with compression enabled before
> the byte argument is treated as decisive.

This tier necessarily edits the middle of core's hydration serialization — it
is exactly the part that cannot reasonably live outside Angular, and the reason
this RFC exists.

### Tier 3 — `renderApplicationStream`

Once tiers 1–2 exist, a first-class renderer in `@angular/platform-server`:

```ts
export function renderApplicationStream(
  bootstrap: (context: BootstrapContext) => Promise<ApplicationRef>,
  options: {
    document?: string;
    url?: string;
    platformProviders?: Provider[];
  },
): ReadableStream<Uint8Array>;
```

Semantics, all validated end-to-end in the prototype:

1. flush the document `<head>` and open the body immediately, before the app
   renders, so asset fetching starts at once;
2. flush each `@defer` block as it resolves — out of document order — annotated
   per Tier 2;
3. at `whenStable`, flush the eager shell, slot-mounted block placement,
   resolved `<head>` reconciliation (title/meta set during render), and
   transfer state as the tail;
4. hydration boots against a document byte-equivalent to a buffered render.

Angular need not own every policy here. The prototype's experience is that some
concerns are genuinely the meta-framework's (crawler/bot fallback to buffered
rendering, per-route opt-out, response header management), while the render
mechanics belong in core. Tier 3 could reasonably ship as
`@angular/ssr`-level API instead; the tier split keeps that decision
independent of tiers 1–2, which are needed either way.

## What the prototype taught us

Findings from building, benchmarking, and e2e-validating the Analog prototype
that should inform the upstream design:

- **Hydration is the hard part, not streaming.** Emitting bytes early is
  straightforward; keeping the final document a valid target for incremental
  hydration is where every constraint lives. The whole-document `ngh` index is
  the single biggest architectural obstacle — Tier 2's stable ids +
  per-block annotation is the minimal change that dissolves it.
- **LCP improves only if the LCP element streams early.** TTFB and FCP wins are
  automatic; LCP is not. In the prototype the eager shell ships in the tail, so
  when the LCP element is in the shell, LCP matches buffered. An upstream
  renderer that streams the eager shell in the _first_ flush (it renders long
  before `whenStable`) would convert LCP too, and would eliminate the small CLS
  cost the prototype's finalize body-swap introduces. This argues for Tier 3
  streaming the shell in document position from the start, rather than the
  prototype's preview-region-then-swap approach.
- **The head timing problem is real but solved.** A title/meta set during
  render isn't known when the head flushes. The prototype reconciles the
  resolved head at the tail (Nuxt does the same with streamed head patches);
  crawlers get a buffered fallback with a fully-resolved head. Angular's
  contribution here is small: a supported way to serialize the resolved
  `<head>` at stability. Policy (when to reconcile vs. fall back) can stay
  above core.
- **Error semantics change after first flush.** Once the head is flushed, the
  status code is committed; a render error must error the stream (truncating
  the response) rather than yield a clean 500. `renderApplicationStream`
  should expose the trichotomy React's streaming renderer settled on rather
  than only documenting the hazard: a shell-ready callback (safe to commit
  status and begin flushing), an all-ready callback (a buffered-for-crawlers
  mode atop the same renderer), and an error callback whose meaning differs
  before and after the shell commits.
- **Event replay interacts with streaming.** Blocks are interactive-looking
  before hydration; `withEventReplay`'s capture script belongs in the first
  flush so interactions during the stream are not lost. Tier 2's per-block
  `jsaction` annotation makes this coherent; the prototype's double-send
  sidesteps it today (`IS_EVENT_REPLAY_ENABLED` is among the internals the
  Tier 2 prototype touches).
- **Edge runtimes need no special treatment in core.** Web-standard
  `ReadableStream` plus DI-scoped callbacks (no `async_hooks`) run anywhere the
  server platform runs.

## Alternatives considered

- **Status quo: meta-frameworks patch `@angular/core`.** Works today — Analog
  ships it behind an experimental flag — but it rides on private FESM symbol
  names, broke across v20 → v21, and Tier 2 deepens the private-symbol surface
  past the point where an out-of-tree patch is responsible. This RFC is the
  exit from that position.
- **A public profiler event instead of a dedicated hook.** Core already emits
  `ProfilerEvent.DeferBlockStateEnd` at exactly the right moment — the
  prototype anchors on it. But the profiler callback is a single global slot,
  events don't carry a serialization handle, and repurposing a
  diagnostics channel as a rendering contract couples two unrelated stability
  guarantees. A dedicated, DI-scoped event (Tier 1) is barely more API and far
  cleaner.
- **Tier 3 only — Angular ships the renderer, no public primitives.** A
  legitimate position: it avoids committing to low-level API, keeps a single
  blessed wire format, and keeps "my streaming broke" support load off
  third-party renderers. The trade-offs are time and feedback: meta-frameworks
  keep patching private symbols until a full renderer stabilizes, and core
  freezes renderer policy without field experience of the primitives
  underneath it. A middle path is to land Tiers 1–2 as experimental and
  explicitly subject to change — patches can be deleted now, while Tier 3's
  policy surface settles on top of proven primitives.
- **Suspense-style streaming of arbitrary async boundaries.** A much larger
  redesign of the component model. `@defer` already gives Angular
  author-declared streaming boundaries with defined server semantics;
  streaming should build on it rather than introduce a parallel concept.
- **Streaming without hydration annotation (Tier 1 forever).** Viable — it's
  what Analog ships — but the permanent +100% byte cost and the
  double-send/finalize-swap complexity make it a stopgap, not an endpoint.

## Non-goals

- Changing the default: `renderApplication` stays buffered; streaming is
  opt-in at every tier.
- Client-side hydration semantic changes: the streamed document hydrates with
  today's `withIncrementalHydration` unchanged.
- Resumability, partial hydration models, or new template syntax.
- Prescribing SEO/bot policy — meta-frameworks decide when to fall back to
  buffered rendering.

## Compatibility and risk

Every tier is additive and dormant unless opted into. Tier 1 adds an event
emission guarded by server mode and an injected callback. Tier 2's stable-id
memoization activates only under streaming (buffered serialization is
byte-identical to today — the prototype's e2e suite asserts this). Tier 3 is a
new export. Existing SSR users see no behavioral change.

**Content Security Policy.** Streaming as prototyped depends on small inline
`<script>` chunks between blocks (paint/mount instructions, head reconcile,
finalize). Angular already threads a nonce through `CSP_NONCE` / `ngCspNonce`;
a streaming renderer must apply that nonce to every streamed script chunk, and
Tier 1's documentation must state the requirement for consumers emitting their
own chunks. For Tier 3 it is worth exploring a design that needs no per-chunk
inline scripts at all — streamed inert `<template>`s driven by a single
nonce'd runtime shipped in the first flush — so strict-CSP apps stream without
`unsafe-inline`.

The main risk is API commitment on serialization internals. The tier structure
is designed to sequence that risk: Tier 1 commits only to "a block resolved,
here's its HTML"; Tier 2 commits to per-block annotation shape; Tier 3 commits
to a renderer. Each tier ships experimental first, with Analog as a
production-scale consumer able to delete its patch plugin the day Tier 1
lands.

## Open questions

1. Should tiers land in `@angular/platform-server` or `@angular/ssr`? Tiers
   1–2 touch core/platform-server internals; Tier 3's policy surface
   (shell-commit timing, error handling) may fit `@angular/ssr` better.
2. Id contract for nested `@defer` blocks — resolution order is well-defined
   for flat blocks; nesting needs a specified parent/child id relationship.
3. Should transfer state stream per block (alongside each `annotate()` result)
   or only in the tail? Per-block enables earlier hydration of early blocks in
   a future model but complicates the client runtime.
4. Whether Tier 3 streams the eager shell in the first flush (the
   LCP-preserving design) from day one, or starts with head-only first flush as
   the prototype does.
5. Interaction with `provideClientHydration(withHttpTransferCacheOptions)` —
   HTTP transfer cache entries resolve throughout the render; per-block
   streaming of those entries would pair with question 3.
6. The exact shape of `SerializedDeferBlockState` and the merge rule between
   per-block state, the root component's tail annotation, and the single
   transfer-state script — the part of Tier 2 that most needs specification
   from the hydration owners.

## Supporting material

- [Analog prototype RFC](./RFC-streaming-ssr.md) — full design, sequence
  diagram, benchmark methodology, validation matrix.
- Prototype implementation: `renderStream`
  (`packages/router/server/src/render-stream.ts`), the core patch plugin
  (`packages/platform/src/lib/ssr/defer-streaming-plugin.ts`), streaming h3
  handler (`@analogjs/vite-plugin-nitro`), and the e2e benchmark app
  (`apps/streaming-app`).
- Byte-cost comparison (same app, ~1.5 KB × 2 blocks): buffered 3716 B;
  Tier 2 single-send 4603 B (+24%); Tier 1 double-send 7439 B (+100%).
  Uncompressed — see the measurement TODO in Tier 2.
