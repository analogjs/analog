# RFC: Fast SSR String Renderer (`renderToString`)

**Status:** Implemented (perf/ssr-lazy-string-tokens branch)
**Author:** Brandon Roberts
**Date:** 2026-07-05
**Package:** @analogjs/router (`@analogjs/router/server`)

---

## Summary

A string-based SSR renderer for Analog that renders an Angular application
to HTML without full browser DOM emulation (Domino / Happy DOM) and without
creating a fresh platform per request. `renderToString(App, config)` is a
drop-in alternative to `render(App, config)` in `main.server.ts` and is
**~40% faster end-to-end** on the analog-app (3.10ms vs 5.18ms mean per
request) while producing hydration-identical output.

## Motivation

The standard `render()` path calls `renderApplication` from
`@angular/platform-server`, which has two structural costs per request:

1. **Full DOM emulation.** Every renderer operation goes through Domino's
   DOM implementation — real node objects, attribute maps, sibling
   pointers — even though server rendering is write-only: nothing ever
   reads the DOM back except the final serializer.
2. **Platform-per-request.** `renderApplication` creates a fresh platform
   (Domino adapter init, platform injector, `PlatformState`,
   `PlatformLocation`) and tears it down in a `finally` — pure overhead,
   since none of it changes between requests.

A write-only renderer can instead accumulate a minimal token tree and
serialize it once at the end. Dropping Domino also removes a dependency
that blocks edge runtime portability.

## Design

Three pieces, all under `packages/router/server/src`:

### 1. DOM shim (`ssr/dom-shim.ts`)

A lightweight document implementation (`ShimDocument`, `ShimElement`,
`ShimNode`, `ShimRaw`) that hosts the _document chrome_: the parsed
`index.html` template, `<head>`, `<base>`, scripts, and the app root
element. It supports the small API surface Angular's server internals
touch on the document (querySelector, createElement/Comment/TextNode,
classList, style, innerHTML, serialization). App content does **not**
live here.

### 2. Token-tree renderer (`ssr/string-renderer.ts`)

A custom `Renderer2` (`StringRenderer` / `StringRendererFactory2`) that
records component output as a token tree instead of DOM nodes. Element
layout is optimized for the write-only case:

- attrs and inline styles: flat `[k, v, k, v]` arrays, lazily allocated
  (`undefined` when empty)
- classes: a single space-delimited string; `class`/`style` route to
  dedicated slots so the serializer never scans for them
- no prev/next sibling pointers — `nextSibling` is computed from
  `children` on demand
- single-pass HTML escaping with a no-op fast path
- void elements and `script`/`style` raw-text rules match Domino's
  serialization byte-for-byte (`name=""` for empty attrs, lowercased
  attribute names)

Tokens also expose a small DOM-node-shaped surface. Angular's
`ɵannotateForHydration` probes renderer-created nodes directly —
`isConnected` decides whether a node is part of the serialized output,
and event-replay stamps `jsaction` attributes via
`nodeType`/`getAttribute`/`setAttribute`/`hasAttribute`. `isConnected`
is a getter that walks `parent` up to the factory's root token.

View encapsulation mirrors `DomRendererFactory2`: per-component renderers
cached by `type.id`, `_ngcontent-*`/`_nghost-*` attribute stamping for
Emulated, style registration through platform-browser's
`SharedStylesHost`, and ShadowDom falling back to Emulated on the server.

After the app stabilizes, `injectIntoDocument()` serializes the token
tree once and splices it into the shim document as a raw node; the shim
document then serializes to the response HTML.

### 3. Cached platform (`render-to-string.ts`)

`renderToString` bypasses `renderApplication` entirely. A single
`platformServer` instance is created lazily and kept for the process
lifetime; each request only creates the application injector
(`bootstrapApplication` with `{ platformRef }`). Per-request state —
the shim `DOCUMENT` and the renderer factory — is provided at the
app/environment injector level, where it shadows platform-level
providers.

Because `renderInternal` is skipped, its post-stable pipeline is
reimplemented explicitly:

- `prepareForHydration`: SSR content-integrity marker,
  `ɵannotateForHydration` (ngh attributes + jsaction event-replay
  annotations), event-replay script insertion or dispatch-script removal
- `appendServerContextInfo`: `ng-server-context` on each bootstrapped
  component host
- `BEFORE_APP_SERIALIZED` callbacks: TransferState's `ng-state` script
  plus our own `injectIntoDocument` hook

`destroySharedPlatform()` is exported for tests and graceful shutdown.

### Known caveats

- `PlatformState.getDocument()` returns the platform-level document, not
  the per-request shim — side-stepped by serializing the shim directly.
- `ServerPlatformLocation` is constructed once from the placeholder
  `INITIAL_CONFIG.url`; anything reading `platformLocation.href` directly
  sees stale data. The Angular Router is unaffected (URL comes from the
  bootstrap context).
- The cached platform holds event-loop handles; long-lived servers are
  fine, but one-shot scripts must call `destroySharedPlatform()` (or
  exit explicitly) to terminate.

## Implementation

### Files

| File                                                  | Role                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `server/src/render-to-string.ts`                      | `renderToString` entry point, cached platform, reimplemented renderInternal pipeline                 |
| `server/src/ssr/string-renderer.ts`                   | Token classes, `StringRenderer`, encapsulation-aware renderers, `StringRendererFactory2`, serializer |
| `server/src/ssr/dom-shim.ts`                          | `ShimDocument` and friends for document chrome                                                       |
| `server/src/utils/reset-component-def-tviews.ts`      | Shared `def.tView` reset (extracted from `render.ts`; both paths use it for `$localize` correctness) |
| `server/src/ssr/__benchmarks__/ssr-renderer.bench.ts` | Vitest micro-benchmarks for shim + renderer                                                          |
| `apps/analog-app/bench-ssr.mjs`                       | End-to-end benchmark: `render()` vs `renderToString()`                                               |
| `apps/analog-app/parity-check.mjs`                    | HTML output diff between the two renderers                                                           |
| `apps/analog-app/src/main.server.string.ts`           | analog-app entry using `renderToString`                                                              |

### Data flow

```
request(url, template, serverContext)
  ├─ resetComponentDefTViews()            # $localize cache reset
  ├─ createDocument(template)             # shim document (per request)
  ├─ getOrCreatePlatform()                # cached platformServer (per process)
  ├─ bootstrapApplication(root, config + {DOCUMENT, RendererFactory2}, {platformRef})
  │    └─ components render into the token tree
  ├─ whenStable()
  ├─ prepareForHydration()                # ngh + jsaction + replay script
  ├─ appendServerContextInfo()            # ng-server-context
  ├─ runBeforeAppSerialized()             # TransferState + injectIntoDocument
  └─ serializeDocument(shim)              # response HTML
```

## Test coverage

- `ssr/dom-shim.spec.ts` — 11 specs (parsing, manipulation, serialization)
- `ssr/string-renderer.spec.ts` — 11 specs: renderer ops, escaping,
  class/style merging, serialize stability, void elements, and the DOM
  surface hydration annotation relies on (`isConnected` lifecycle,
  `nodeType` constants, direct attribute access)

### Output parity (analog-app, `/`)

`parity-check.mjs` diffs `render()` against `renderToString()`:
1919B vs 1914B, 48 fragments each, identical `__nghData__`, identical
jsaction/event-replay output. Remaining diffs are cosmetic only:

- a whitespace text node before `<body>` that Domino preserves and the
  shim drops
- whitespace around the `ng-state` script
- `class` serialized after other attributes rather than at insertion
  position

### Benchmarks

End-to-end (`bench-ssr.mjs`, 100 iterations, analog-app `/`):

| Renderer            | Mean       | Median     | P95    |
| ------------------- | ---------- | ---------- | ------ |
| `render()` (Domino) | 5.18ms     | 5.19ms     | 5.96ms |
| `renderToString()`  | **3.10ms** | **3.10ms** | 3.81ms |

Micro (vitest bench, ~250-element tree): build ~51µs, serialize ~24µs,
full cycle (document + build + serialize + inject) ~100µs.

## Example usage

```ts
// src/main.server.ts
import 'zone.js/node';
import '@angular/platform-server/init';
import { renderToString } from '@analogjs/router/server';

import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

export default renderToString(AppComponent, config);
```

## Future work

- **Streaming**: hydration annotation retroactively touches host elements
  across the whole tree after stability, so element-granular forward-only
  streaming is off the table; the practical shapes are shell-first
  streaming and chunked serialization of the token tree post-stability.
  See `feat/ssr-streaming` for the shell-first approach.
- **Cosmetic parity**: inter-tag whitespace preservation in the shim
  parser and insertion-ordered `class` serialization, if byte-exactness
  with Domino ever matters.
- **Edge runtimes**: the renderer is Domino-free by design; validating on
  Cloudflare Workers / Deno Deploy is unproven.
- **Default entry**: decide how `renderToString` is exposed in the
  scaffold (opt-in flag vs default for new apps).
