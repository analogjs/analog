# RFC: Introduce Analog Server Functions

**Status:** Implemented (`feat/server-functions-rfc` branch)
**Author:** Brandon Roberts
**Date:** 2026-07-09
**Packages:** `@analogjs/router` (`/server` + client entries) · `@analogjs/vite-plugin-nitro` · `@analogjs/platform`

---

## Summary

Add a typed, validated, **DI-aware** server function primitive to Analog:

```ts
// products.server.ts
import { serverFn } from '@analogjs/router/server';
import { inject } from '@angular/core';
import { REQUEST } from '@analogjs/router/tokens';
import * as v from 'valibot';

export const getProduct = serverFn(
  { method: 'POST', input: v.object({ id: v.string() }) }, // input ⇒ POST
  async (input) => {
    const catalog = inject(CatalogService); // runs in the SSR request injector
    const req = inject(REQUEST); // Analog's request-scoped token
    return catalog.find(input.id, req.headers['accept-language']);
  },
);
```

A server function is an `async` function whose body executes **inside the same
request-scoped injection context Analog already builds for SSR**, and whose
client half is a first-class Angular `resource()`, hydrated the same way `load`
is. It generalizes the existing
route-bound `load` / `action` mechanism into an arbitrary, colocated,
type-inferred RPC callable — without introducing a new DI story, a bespoke
client cache, or a non-idiomatic builder API.

## Motivation

Analog can already run server code from a colocated `*.server.ts` file, but only
in two fixed shapes, both bound to a page route:

- `load` — one GET per page, invoked during navigation, consumed via
  `injectLoad` (`packages/router/src/lib/inject-load.ts`).
- `action` — one POST per page, consumed via the `FormAction` directive.

That covers page data and form posts, but not the common case of _"call this
one typed, validated server operation from anywhere — a component, an effect, a
resolver — and get the result back with DI on the server."_ Today that requires
hand-writing a Nitro API route + a client `fetch`/`HttpClient` call + manual
typing on both ends. `serverFn` is the typed client/server RPC primitive for
Analog; it supersedes the `@analogjs/trpc` integration, which is no longer a
recommended path.

The pieces to do better already exist in the tree; they are just not composed
into a general primitive:

- **Server DI context** — `provideServerContext({ req, res })`
  (`packages/router/server/src/provide-server-context.ts`) already provides
  `REQUEST`, `RESPONSE`, `BASE_URL`, `LOCALE` from `@analogjs/router/tokens`
  into the SSR injector per request.
- **The endpoint transform** — `pageEndpointsPlugin`
  (`packages/vite-plugin-nitro/src/lib/plugins/page-endpoints.ts`) already
  esbuild-scans a `.server.ts` for `load` / `action` exports and wraps them in an
  h3 `defineEventHandler`, dispatching by method.
- **Endpoint routing** — `getPageHandlers`
  (`packages/vite-plugin-nitro/src/lib/utils/get-page-handlers.ts`) already
  globs `*.server.ts` and registers Nitro routes.
- **Response helpers** — `json` / `redirect` / `fail`
  (`packages/router/server/actions/src/actions.ts`).
- **Client scrub** — `clearClientPageEndpointsPlugin`
  (`packages/platform/src/lib/clear-client-page-endpoint.ts`) already replaces a
  `.server.ts` module with `export default undefined;` on the client build. It is
  scoped to `src/app/pages/` and today discards all exports.
- **Server→client hydration** — the `TransferState`-based transfer Analog already
  uses for `load`: a value resolved during SSR is serialized into the page and
  rehydrated on the client with no refetch, independent of HTTP method. Uses
  Angular-core `TransferState`, so no HTTP transfer-cache configuration.

This RFC composes those into `serverFn`.

## Goals

- A single authoring API for arbitrary server operations, colocated in
  `*.server.ts`, with **end-to-end type inference** (input from the validator,
  output from the handler return).
- **`inject()` works in the handler**, resolving from the per-request SSR
  injector — request tokens (`REQUEST`/`RESPONSE`/`BASE_URL`/`LOCALE`) and app
  services alike.
- **Middleware as functional interceptors**, composed through DI in the same
  shape as `provideHttpClient(withInterceptors([...]))`.
- **Idiomatic client consumption**: the reactive form is a `resource()` whose
  loader rides `HttpClient` (via `ServerFnClient`), so it inherits client
  `HttpInterceptorFn`s and `HttpTestingController` testing, and hydrates via
  `TransferState` with no HTTP transfer-cache configuration.
- **One client primitive** — `injectServerFn` covers both reactive reads (a
  `ResourceRef`) and imperative calls (a bound callable), in the `injectLoad`
  helper family; no separate hook per mode.
- Server code and its dependencies never enter the client bundle. On the client,
  a `.server.ts` is rewritten to only its tree-shakeable `serverFn` proxies;
  every other export and its server-only imports are scrubbed and tree-shaken.
- **`serverFn` is supported in existing `.server.ts` files**, coexisting with the
  `load` / `action` in the same module.
- `load` / `action` become expressible as thin sugar over `serverFn`.
- Server functions do not bypass normal app authorization. The primitive provides
  validation, same-origin transport, and interceptor hooks; apps still decide
  which users can call which operations.

## Non-Goals

- **Inline `serverFn` inside client route files** (TanStack Start's "extract the
  closure out of the component" model). v1 is file-scoped to `*.server.ts`,
  which sidesteps closure hoisting entirely because the module is already
  server-only. Inline authoring is deferred (see Future Work).
- A new client data cache. We reuse Angular's `resource()`, `HttpClient` (via
  `ServerFnClient`), and `TransferState`.
- A central procedure registry / "router" object. Server functions are grouped
  by module colocation (`*.server.ts`), not a single typed router. Consumers
  import the exact exports they use; there is no root type to assemble. This is
  the deliberate replacement for the tRPC router model — larger surfaces are
  many colocated `serverFn` exports, not one procedure tree.

## Design

### 1. Authoring API (server entry)

`serverFn(config, handler)` lives in `@analogjs/router/server` (server-only
entry — it already depends on `@angular/platform-server`).

```ts
export interface ServerFnConfig<In> {
  id: string; // stable id → route /_analog/fn/<id>. Required today; the
  // transform will derive hash(fileId + exportName) later (Future Work), at
  // which point the illustrative examples below become literal.
  method?: 'GET' | 'POST'; // default 'POST'. GET is only valid with no input.
  input?: StandardSchemaV1<In>; // valibot/zod/arktype via Standard Schema
}

export declare function serverFn<In, Out>(
  config: ServerFnConfig<In>,
  handler: (input: In, context: ServerFnContext) => Promise<Out> | Out,
): ServerFn<In, Out>;
```

`ServerFn<In, Out>` is a branded callable whose **type** is `(input: In) =>
Promise<Out>`. On the server it is the real handler; on the client the build
replaces the implementation with an RPC proxy while preserving that type (see
Data Flow). The handler body runs via `runInInjectionContext`, which is what
makes top-level `inject()` inside it legal.

The interceptor-accumulated context is passed to the handler as its **second
argument** (`ServerFnContext`), not injected — a parameter is explicit and
discoverable. `ServerFnContext` is an interface apps extend by declaration
merging; because interceptors are registered through DI at runtime, the
per-handler context type cannot be inferred from them statically, so
augmentation is the typing seam.

**Transport.** Input-bearing functions are **POST**, with `input` in the request
body; we do not query-serialize. `method: 'GET'` is reserved for input-less
reads (its only benefit is runtime HTTP/CDN cacheability — hydration does not
depend on the method; see Client consumption). A `GET` config that also declares
an `input` schema is a build-time error.

> **Injection-context rule.** `inject()` is valid _inside the handler body_
> (invoked in an injection context at call time), not at module scope where
> `serverFn(...)` is declared. This matches the `assertInInjectionContext` guard
> on `injectLoad` and every other Analog inject-helper.

### 2. DI-aware execution — reuse `provideServerContext`

The generated endpoint runs the handler inside the request injector Analog
already assembles for SSR. Conceptually:

**Provider source.** Server function endpoints must run with the same application
server providers used by SSR. The implementation introduces a generated virtual
server module that imports the app's SSR entry (`src/main.server.ts`) and exposes
the merged server `ApplicationConfig` providers used by `render(...)`. Generated
server function handlers build a per-request child injector from:

1. `provideServerContext({ req, res })`
2. the app server providers from the SSR entry
3. `provideServerFns(...)` interceptor providers registered in
   `app.config.server.ts`

This keeps server functions aligned with SSR without asking users to configure a
second provider graph. If the SSR entry does not expose provider metadata in a
usable form, the build emits a clear error explaining that server functions
require the standard Analog `render(AppComponent, config)` server entry shape.

The endpoint does not reuse a singleton app injector across requests. It creates
a request-scoped injector per call so `REQUEST`, `RESPONSE`, `BASE_URL`,
`LOCALE`, and request-scoped app services resolve to the current request.

```ts
// generated per endpoint (see page-endpoints.ts analogue)
export default defineEventHandler(async (event) => {
  const injector = createRequestInjector([
    ...provideServerContext({ req: event.node.req, res: event.node.res }),
    ...appServerProviders, // extracted from the standard Analog SSR entry/config
    ...serverFnInterceptorProviders, // provideServerFns(withServerFnInterceptors(...))
  ]);
  const input = await decodeAndValidate(event, fn.config);
  return runInInjectionContext(injector, () =>
    runInterceptors(injector, { input }, (ctx) =>
      fn.handler(ctx.input, ctx.context),
    ),
  );
});
```

So inside a handler: `inject(REQUEST)`, `inject(RESPONSE)`, `inject(LOCALE)`
(all from `@analogjs/router/tokens`) and any provided service resolve exactly as
they do inside a component during SSR. Request-scoped providers work because it
is a real per-request child injector, not a singleton.

**The surface is strictly DI.** The raw `H3Event` is used only internally to
build the injector and decode input — it is never handed to interceptors or
handlers. All request/response access goes through the `REQUEST` / `RESPONSE` /
`BASE_URL` / `LOCALE` tokens. This keeps handlers portable across the h3 runtime
and testable by overriding those tokens in `TestBed`, with no `event` to mock.

### 3. Middleware = functional interceptors, provided via DI

Modeled directly on `HttpInterceptorFn`. Interceptors are **not** attached
per-function; they are provided once and apply to every server function,
ordered by registration — the mental model developers already have from HTTP
interceptors.

```ts
// tenant.server-interceptor.ts
import { ServerFnInterceptorFn } from '@analogjs/router/server';
import { inject } from '@angular/core';
import { fail } from '@analogjs/router/server/actions';

export const authInterceptor: ServerFnInterceptorFn = (ctx, next) => {
  const session = inject(SessionService); // DI inside the interceptor
  if (!session.user()) return fail(401, { message: 'unauthenticated' });
  return next(ctx.with({ user: session.user() })); // typed context accumulates
};
```

```ts
// app.config.server.ts — mirrors provideHttpClient(withInterceptors(...))
provideServerFns(
  withServerFnInterceptors([
    authInterceptor,
    tenantInterceptor,
    loggingInterceptor,
  ]),
),
```

The feature builder is `withServerFnInterceptors`, not `withInterceptors`, to
avoid colliding with the `withInterceptors` already exported for
`provideHttpClient`. It follows the same `provide*(with*())` shape.

`ServerFnInterceptorFn = (ctx: ServerFnContext, next: ServerFnHandler) =>
Promise<Response | unknown>`. The `ctx.with({...})` helper threads a typed
context object down the chain; the accumulated type is visible to later
interceptors and is delivered to the handler as its second argument. Returning a
`Response` (via
`fail` / `redirect` / `json`) short-circuits — reusing the existing action
helpers verbatim.

### 4. Validation

`config.input` is any Standard Schema validator (valibot is the Analog default;
zod and arktype also conform). It runs server-side before the
handler. The same schema may optionally run client-side for early feedback,
which is free because Standard Schema is isomorphic.

### 5. Security boundary

Server functions are HTTP endpoints and use the same trust model as Analog's
existing server endpoints: validation protects input shape, not authorization or
intent. Authentication and authorization belong in app-provided
`ServerFnInterceptorFn`s or in the handler itself.

The generated transport is same-origin by default. Client proxies call relative
`/_analog/fn/{hash}` URLs, and the framework does not add CORS headers for
server functions. Cross-origin access must be enabled explicitly by user Nitro
middleware if an app wants that behavior.

Input-bearing server functions use `POST` with a JSON body. The endpoint rejects
unsupported content types for JSON server function calls with `415`, rejects
schema-invalid input with a 4xx `fail(...)`, and does not execute the handler
until decoding and validation succeed.

Because server functions may be cookie-authenticated, CSRF is treated as an app
security concern but the framework reserves a hook for it: a built-in interceptor
or endpoint guard can verify `Origin` / `Referer` for unsafe methods when those
headers are present. Apps with custom requirements can replace or augment this
behavior with server function interceptors.

### 6. Client consumption — a `resource()` hydrated from `TransferState`

The reactive form returns a `ResourceRef<Out>` from Angular's `resource()`
(`packages/core/src/resource/resource.ts`) whose loader calls `ServerFnClient` —
so requests still ride `HttpClient` and its interceptors. This is the client half
of every server function: a normal Angular resource.

```ts
@Component({
  /* … */
})
export class ProductCard {
  id = input.required<string>();
  protected product = injectServerFn(getProduct, () => ({ id: this.id() }));
}
```

```html
@if (product.value(); as p) { {{ p.name }} } @else if (product.error()) {
<error-banner [err]="product.error()" /> } @else { <spinner /> }
```

A read automatically gets: client `HttpInterceptorFn`s (via `ServerFnClient` /
`HttpClient`), signal state (`value`/`status`/`error`/`reload`), and
`HttpTestingController` in tests.

**Hydration is method-independent and needs no configuration.** Reads hydrate the
same way `load` does — not through the HttpClient transfer cache. When the
resource resolves during SSR, its value is serialized into the page under a
`TransferState` key derived from the function id and serialized input; on the
client the resource takes that seeded value as its first result with no request,
then fetches normally on later reactive changes. This uses Angular-core
`TransferState` directly, so **no `provideClientHydration` /
`withHttpTransferCacheOptions` / `includePostRequests` setup is required, and a
POST read (any input-bearing read) hydrates exactly like a GET.**

`injectServerFn` is the **single client primitive**, with two forms selected by
overload. It must run in an injection context (it `inject()`s the transport),
guarded by `assertInInjectionContext` exactly like `injectLoad` — the same
inject-helper family it belongs to.

```ts
export declare function injectServerFn<In, Out>( // reactive read → resource
  fn: ServerFn<In, Out>,
  args: () => NoInfer<In>,
): ResourceRef<Out>;

export declare function injectServerFn<In, Out>( // bound imperative callable
  fn: ServerFn<In, Out>,
): (input: In) => Promise<Out>;
```

**Reactive read** — given a signal-reading args factory, returns a
`ResourceRef<Out>` from `resource()`. It refetches when the read signals change,
and its `value` is a writable signal, so optimistic updates are a
`.value.set(...)` followed by `.reload()`. (The `ProductCard` example above.)

**Bound callable** — given no args factory, returns a DI-bound `(input) =>
Promise<Out>` for mutations, resolvers, effects, and `load`:

```ts
@Component({
  /* … */
})
export class Checkout {
  private place = injectServerFn(placeOrder); // POST serverFn → callable
  async submit(sku: string, qty: number) {
    const { orderId } = await this.place({ sku, qty });
  }
}

export const load = async () => {
  const loadProduct = injectServerFn(getProduct);
  return { product: await loadProduct({ id: 'p_1' }) };
};
```

Both forms go through the same injected transport, so client interceptors apply
either way. During SSR
the transport short-circuits the
HTTP round-trip and invokes the handler in-process within the request injector;
HTTP is only the browser transport.

`ServerFnClient` is the lower-level injectable the callable form is built on
(`inject(ServerFnClient).call(fn, input)`); reach for it only when you need the
transport outside an injection context. Prefer `injectServerFn`. Both are
**client-safe** and live in the main `@analogjs/router` entry, not `/server`
(see Entry-Point Boundary).

### 7. Errors

Handlers and interceptors signal failure with the existing `fail(status,
errors)` helper, which already tags responses with `X-Analog-Errors`. On the
client, the resource surfaces these as `HttpErrorResponse` (thrown by
`HttpClient` through `ServerFnClient`) in `.error()`, and `redirect()` is honored
by the transport.

### 8. Relationship to `load` / `action`

`load` and `action` become sugar:

- a page `load` ≡ a `serverFn({ method: 'GET' })` auto-bound to the route and
  consumed by `injectLoad`;
- an `action` ≡ a `serverFn({ method: 'POST' })` consumed by `FormAction`.

`page-endpoints.ts` can be re-expressed on top of the general endpoint
transform, collapsing two code paths into one. This is proposed as a follow-up,
not a prerequisite, to keep the first cut additive and low-risk.

## Version requirements

The client half uses Angular's `resource()` (first shipped experimental in
**Angular 19.0**, stable API in 22.0), `HttpClient`, and `TransferState`. It does
**not** depend on `httpResource`, so the floor is **`@angular/core` /
`@angular/common` ≥ 19.0** — consuming the experimental `resource()` API on
19.0–21 and the stable API on 22+.

This is a higher floor than `@analogjs/router`'s current peer range
(`^17 || … || ^22`), so `serverFn` is gated to 19.0+ rather than lowering the
whole package's support. Consuming an experimental API means tracking its changes
across minors.

## Entry-Point Boundary (import safety)

This is a deliberate design constraint, not an accident of layout:

| Symbol                                                                              | Entry                     | Why                                                          |
| ----------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| `serverFn`, `ServerFnInterceptorFn`, `provideServerFns`, `withServerFnInterceptors` | `@analogjs/router/server` | Server-only; authored in `*.server.ts`, stripped from client |
| `injectServerFn`, `ServerFnClient`, `provideServerFnClient`                         | `@analogjs/router` (main) | Client-safe; must be importable from components              |

A user's `*.server.ts` imports `serverFn` from `/server`; a component imports
`injectServerFn` from the root entry and references the _same exported symbol_
(`getProduct`), which the client build has rewritten to a proxy carrying
`{ url, method }`. The types line up because only the implementation is swapped.

## Implementation

### Files changed / added

| File                                                                     | Change                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/router/server/src/server-fn/server-fn.ts`                      | **new** — `serverFn`, authored in `*.server.ts`; self-registers and delegates ref construction to `createServerFnRef`                                         |
| `packages/router/server/src/server-fn/interceptors.ts`                   | **new** — `ServerFnInterceptorFn`, `provideServerFns`, `withServerFnInterceptors`, `SERVER_FN_INTERCEPTORS`, chain runner + `ctx.with`                        |
| `packages/router/server/src/server-fn/dispatch.ts`                       | **new** — `dispatchServerFn`: lookup → validate → per-request injector → interceptors → `runInInjectionContext(handler)`; `Response` short-circuit            |
| `packages/router/server/src/server-fn/registry.ts`                       | **new** — id-keyed `serverFnRegistry` populated by `serverFn` at import time                                                                                  |
| `packages/router/server/src/index.ts`                                    | export the server authoring + dispatch surface                                                                                                                |
| `packages/router/src/lib/server-fn/types.ts`                             | **new** — client-safe shared types (`ServerFn`, `ServerFnConfig`, `ServerFnContext`, `StandardSchemaV1`, …)                                                   |
| `packages/router/src/lib/server-fn/server-fn-ref.ts`                     | **new** — `createServerFnRef` factory shared by the server `serverFn` and the client scrub proxy (identical `{ __serverFn, id, url, method }` refs)           |
| `packages/router/src/lib/server-fn/inject-server-fn.ts`                  | **new** — `injectServerFn` (`resource()`-based, `TransferState` hydration), `ServerFnClient` (over `HttpClient`), `provideServerFnClient`                     |
| `packages/router/src/index.ts`                                           | export the client surface + `createServerFnRef`                                                                                                               |
| `packages/vite-plugin-nitro/src/lib/utils/get-server-fn-handlers.ts`     | **new** — discovers `<projectRoot>/src/**/*.server.ts` modules (+ `additionalServerFnDirs`), excludes SSR config, de-duped + sorted                           |
| `packages/vite-plugin-nitro/src/lib/utils/server-fn-endpoints.ts`        | **new** — generates the single `/_analog/fn/:id` Nitro dispatch handler as a virtual module importing the discovered modules + provider set                   |
| `packages/vite-plugin-nitro/src/lib/vite-plugin-nitro.ts` · `options.ts` | register the dispatch handler + virtual module (both config blocks) when server fns exist; add `additionalServerFnDirs` + providers-module convention         |
| `packages/platform/src/lib/server-fn-client-transform.ts`                | **new** — `oxc-parser` scrub: rewrite each `export const NAME = serverFn(config, handler)` to `createServerFnRef({ id, method })`, dropping handler + imports |
| `packages/platform/src/lib/clear-client-page-endpoint.ts`                | run the server-fn scrub first, else fall back to the page `export default undefined;`; `serverFn` coexists with `load`/`action`; `<projectRoot>/src/**` scope |

### Data flow

**Build.** One `*.server.ts` module is compiled two ways: the server graph
imports every discovered module so its `serverFn`s register into an id-keyed
registry behind a single dispatch route; the client graph replaces the module
with transport proxies and strips the handler bodies.

```mermaid
flowchart TB
  src["users.server.ts<br/>export const getProduct = serverFn(config, handler)"]

  subgraph serverGraph["Server build — vite-plugin-nitro"]
    direction TB
    scan["get-server-fn-handlers.ts<br/>glob src/**/*.server.ts (excl. SSR config)"]
    gen["server-fn-endpoints.ts<br/>generate one /_analog/fn/:id virtual handler<br/>importing the modules (registration) + providers"]
    reg["dispatchServerFn<br/>registry lookup → validate → interceptors → runInInjectionContext"]
    scan --> gen --> reg
  end

  subgraph clientGraph["Client build — platform (clear-client-page-endpoint)"]
    direction TB
    proxy["clearClientPageEndpointsPlugin (generalized)<br/>emit tree-shakeable proxies { __serverFn, url, method }"]
    elim["scrub every non-serverFn export (load / action / helpers)<br/>server-only imports tree-shaken out"]
    proxy --> elim
  end

  src --> scan
  src --> proxy
```

All server functions share one `/_analog/fn/:id` transport route; the `id`
selects the function from the registry at request time. Ids are authored
explicitly on the config today — deriving `id = hash(fileId + exportName)` in the
transform (so authors omit it) is deferred (see Future Work). The client scrub is
done by the platform package's `clearClientPageEndpointsPlugin`, not
`vite-plugin-angular`.
Today it replaces a page `.server.ts` with a single `export default undefined;`.
Generalized, it instead **rewrites the module to only its client-safe surface**:
one tree-shakeable named proxy per `serverFn` export, and nothing else — every
other export (`load`, `action`, server-only helpers) and its imports are scrubbed
so they tree-shake out of the client graph. `serverFn` is therefore supported in
the same `.server.ts` files that already hold `load`/`action`; the two coexist,
and each unused proxy drops on its own. Because the transform runs after
type-checking, the consumer type-checks against the real `ServerFn<In, Out>`
type while the runtime value is the proxy — inference holds end to end.

**Runtime.** `injectServerFn` drives a `resource()` (or a bound callable) that
goes through `HttpClient`; the request lands on the generated endpoint, which
builds the per-request injector, runs interceptors, and invokes the handler in
that injection context.

```mermaid
sequenceDiagram
  autonumber
  participant Cmp as Component / load
  participant Res as injectServerFn (resource)
  participant Http as ServerFnClient / HttpClient<br/>(interceptors)
  participant Ep as Nitro /_analog/fn/:id
  participant Inj as Request injector<br/>(provideServerContext)
  participant Mw as Interceptor chain
  participant Fn as serverFn handler

  Cmp->>Res: read args() signal
  Res->>Http: request { url, method, body or params }
  Note over Http,Ep: browser → HTTP · SSR → in-process (same injector)
  Http->>Ep: dispatch
  Ep->>Ep: decode + validate input
  Ep->>Inj: build per-request injector
  Inj->>Mw: run interceptors (accumulate typed context)
  Mw->>Fn: runInInjectionContext(handler)
  Fn-->>Mw: result — or fail() / redirect()
  Mw-->>Ep: Response
  Ep-->>Http: JSON / status
  Http-->>Res: value — or HttpErrorResponse
  Res-->>Cmp: signals (value / status / error)
```

During SSR the `Http → Ep` hop is in-process, not a network call. A read resolved
during SSR seeds its value into `TransferState` (keyed by function id + input);
on the client the resource takes that seed as its first value with no refetch,
independent of HTTP method and with no transfer-cache configuration (see Client
consumption).

## Test coverage

**Unit specs.**

- **Discovery** (`get-server-fn-handlers.spec.ts`, 4): globs `src/**/*.server.ts`
  incl. page files, excludes SSR config + non-`.server.ts`, deterministic sorted
  de-duped output, `additionalServerFnDirs`.
- **Endpoint generation** (`server-fn-endpoints.spec.ts`, 7): the `/_analog/fn/:id`
  registration + `/api` prefix, and the generated virtual module — module
  registration imports, provider wiring vs. empty fallback, dispatch by router
  param.
- **Client scrub** (`server-fn-client-transform.spec.ts`, 7): null for
  non-`serverFn` modules; proxies keep `id` + method with all server imports
  dropped; POST-from-`input` vs. GET default vs. explicit method; aliased
  `serverFn` import; `load` shim preserved when a page file also hosts a fn;
  throws on a non-static `id`.

**Runtime harnesses** (execute the built `node_modules` packages under bun):

- `validate-server-fn.ts` — in-process dispatch: GET/POST, DI (`inject`) in the
  handler, 400 validation, 401 interceptor short-circuit, 404 unknown fn.
- `validate-http-server-fn.ts` — the same over a real HTTP round-trip.
- `validate-client-proxy-server-fn.ts` — scrubs the real `products.server.ts`
  through the built platform transform and imports the emitted module, asserting
  GET `/_analog/fn/getProducts` + POST `/_analog/fn/getProduct` proxy refs with
  no server code.

**Deferred** (need a live Angular build/serve): `TestBed.runInInjectionContext`
DI-execution specs and `provideHttpClientTesting()` client specs.

## Example usage (end to end)

```ts
// orders.server.ts
import { serverFn } from '@analogjs/router/server';
import { fail } from '@analogjs/router/server/actions';
import { inject } from '@angular/core';
import * as v from 'valibot';

export const placeOrder = serverFn(
  { method: 'POST', input: v.object({ sku: v.string(), qty: v.number() }) },
  async (input) => {
    const orders = inject(OrderService);
    const result = await orders.place(input.sku, input.qty);
    if (!result.ok) return fail(409, { reason: result.reason });
    return { orderId: result.id };
  },
);
```

```ts
// checkout.page.ts
import { injectServerFn } from '@analogjs/router';
import { placeOrder } from './orders.server';

@Component({
  /* … */
})
export default class CheckoutPage {
  private place = injectServerFn(placeOrder); // bound callable form
  async submit(sku: string, qty: number) {
    const { orderId } = await this.place({ sku, qty });
    // navigate to confirmation…
  }
}
```

## Alternatives considered

- **Fluent builder** (`serverFn().validator().middleware().handler()`, TanStack
  Start style). Rejected as non-idiomatic; DI-provided functional interceptors
  and a plain `(config, handler)` signature fit Angular conventions and keep
  middleware out of every call site.
- **Bespoke client cache.** Rejected in favor of Angular's `resource()` +
  `HttpClient` (via `ServerFnClient`) + `TransferState`, which give interceptors,
  hydration, and testing with no new cache.
- **Hydrate via the HttpClient transfer cache.** Rejected: it is request-keyed
  and GET-only by default, so parameterized (POST) reads would need
  `provideClientHydration(withHttpTransferCacheOptions({ includePostRequests }))`
  configuration. Seeding `TransferState` by key (like `load`) hydrates any read
  with zero configuration and independent of method.
- **New top-level package** (`@analogjs/server-fn`). Rejected; the feature is a
  generalization of router `load`/`action` and shares its server context and
  transform, so it belongs in `@analogjs/router` (`/server`).
- **Keep `@analogjs/trpc` as the RPC story.** No longer an option — tRPC is
  being retired; `serverFn` is its replacement, so the RFC does not position the
  two as coexisting choices.

## Future work

- **Derive `id`** as `hash(fileId + exportName)` in the scrub/discovery transform
  so authors omit it (today the config carries an explicit `id`).
- **Non-inline export forms** in the client scrub: the transform matches inline
  `export const NAME = serverFn(...)`; `const x = serverFn(...); export { x }` is
  not yet rewritten.
- **Inline `serverFn`** in client route files via closure extraction in
  `vite-plugin-angular` (the genuinely novel piece; v2).
- **Re-express `load`/`action`** on top of the shared endpoint transform.
- **Client interceptor leg** for `ServerFnInterceptorFn` (a `.client()`-style
  phase), matching HTTP interceptors more fully.
- **Streaming / async-iterable returns** for progressive results.
- **Schematic** to scaffold a `*.server.ts` with a `serverFn` and its consumer.
- **tRPC migration guide + codemod** — map each `@analogjs/trpc` procedure to a
  colocated `serverFn` (query → `method: 'GET'`, mutation → `method: 'POST'`,
  router grouping → module colocation) so existing consumers have a mechanical
  path off the retired integration.

## Open questions

None — all resolved and folded into Design:

- **Request/response surface** → strictly DI (`REQUEST`/`RESPONSE`/`BASE_URL`/
  `LOCALE` tokens). The raw `H3Event` is never exposed to user code.
- **Interceptor context** → passed to the handler as a second argument
  (`ServerFnContext`), not injected.
- **Input encoding** → require POST for any input; GET is reserved for input-less
  reads. No query-serialization.
- **Discovery scope** → glob `<projectRoot>/src/**/*.server.ts` by default (both
  endpoint discovery and the client scrub).
