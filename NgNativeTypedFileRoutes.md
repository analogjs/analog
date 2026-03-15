# Ng-Native Typed File Routes

## Goal

Implement [#2044](https://github.com/analogjs/analog/issues/2044) in a way that gives Analog:

- compile-time type-safe navigation
- typed route params and query params
- optional runtime validation using Standard Schema
- full compatibility with Angular Router
- a clean path to typed page loads, typed page actions, and typed API routes

This document is intended to be the richer execution brief for future implementation work, not just a feature sketch.

## Executive Summary

The strongest competitor idea is not simply "generate typed paths". The strongest idea is a full route contract system:

- generated route artifacts as a stable source of truth
- typed navigation helpers built on top of those artifacts
- optional schema-backed route contracts for params and query
- loader and data semantics that depend explicitly on validated URL state
- devtools and diagnostics that make the route system inspectable

Analog should borrow those ideas while staying Angular-native:

- keep Angular Router as the runtime authority
- generate app-local route artifacts in the build/plugin layer
- expose stable helper APIs from `@analogjs/router`
- use Standard Schema as the reusable contract language
- keep Nitro/h3 as the transport/runtime layer, not the public routing mental model

That positioning fits Angular's existing public router model well. Angular's own routing reference centers `Router`, `provideRouter`, `RouterLink`, `ActivatedRoute`, and link-parameter arrays as the main authoring surface rather than alternate routing runtimes or generated router modules. See [`frameworks/angular-main/adev/src/content/guide/routing/router-reference.md`](frameworks/angular-main/adev/src/content/guide/routing/router-reference.md) and [`frameworks/angular-main/adev/src/content/guide/routing/navigate-to-routes.md`](frameworks/angular-main/adev/src/content/guide/routing/navigate-to-routes.md).

## What We Are Solving

Today Analog already has:

- filesystem-based route discovery
- Angular Router integration
- Standard Schema support in server actions and API routes
- Standard Schema support for content frontmatter

What it does not yet have is a single cohesive route contract story that connects:

- filename-derived route structure
- typed navigation
- typed params and query state
- validated params/query at runtime boundaries
- future typed loads and page actions

That gap is exactly where the best ideas from TanStack Router and Nuxt are useful.

## Non-goals

- replacing Angular Router
- requiring schemas for every route
- introducing a custom client-side forms/runtime routing system
- making route typing depend on executing arbitrary user code during type generation
- turning Nitro or h3 APIs into the primary public API for page authors
- validating every client-side navigation at runtime by default

## Design Principles

- The file system is the source of route structure.
- Schemas are optional refinements, not the base requirement.
- Generated helpers should wrap Angular Router, not replace it.
- Compile-time and runtime should compose, but each should be independently useful.
- Build-time generation and runtime consumption should be clearly separated.
- Public route contracts should not leak private framework transport details like `/_analog/pages/*`.

This is also a good match for Angular's runtime API surface. Angular already exposes `Router#createUrlTree()`, `Router#navigate()`, `Router#navigateByUrl()`, and `RouterLink` as the canonical navigation primitives, which makes typed file routes a good fit as a generated contract layer over those APIs instead of a competing router runtime. See [`frameworks/angular-main/packages/router/src/router.ts`](frameworks/angular-main/packages/router/src/router.ts) and [`frameworks/angular-main/packages/router/src/directives/router_link.ts`](frameworks/angular-main/packages/router/src/directives/router_link.ts).

## Competitor Baseline And Positioning

### TanStack Router

TanStack Router is the strongest direct product reference.

Its most intelligent ideas are:

- a generated route artifact as a first-class public contract
- route-local param parsing and search validation
- a distinction between navigation input types and runtime output types
- explicit route lifecycle phases
- `loaderDeps` so URL-derived state participates in revalidation and caching intentionally
- devtools that understand route tree, params, search, and loader state

What Analog should copy:

- the generated artifact mindset
- the input/output schema distinction
- the route lifecycle clarity
- the notion that validated query state is real application state

What Analog should not copy:

- a new router runtime
- hook-centric APIs
- route modules as the primary authoring model
- a React-style router mental model

### Nuxt

Nuxt is the best operational reference for typed routes.

Its most useful ideas are:

- generate route typings automatically in dev/build
- auto-wire those generated files into the TS program
- propagate typed routing into all major route entrypoints

What Analog should copy:

- generation integrated into the build/watch lifecycle
- app-local generated typing artifacts
- broad propagation of typed route information into multiple APIs

What Analog should not copy:

- a route-name-first public model
- predicate-style page validation as the main route contract

### Astro

Astro is less useful as a public typed-routing model, but valuable as an internal engine reference.

Its most useful ideas are:

- disciplined route-manifest generation
- careful route collision handling
- solid watch/rebuild behavior

What Analog should copy:

- manifest discipline
- generator robustness
- good internal diagnostics

What Analog should not copy:

- keeping the manifest power mostly internal
- skipping a stable public typed route artifact

## Why Analog Is Well Positioned

Analog already has the most important contract primitive many frameworks do not: Standard Schema used across multiple surfaces.

That means Analog can potentially offer:

- typed file routes
- typed page params/query
- typed page actions
- typed API contracts
- typed content frontmatter

all with one schema language and one mental model.

That is a much stronger story than "typed navigation" alone.

## Current Analog Architecture

At a high level, the current system already has the right separation:

- `@analogjs/platform` owns build-time discovery and Vite integration
- `@analogjs/router` owns Angular-facing runtime routing
- `@analogjs/content` owns content/frontmatter behavior
- `@analogjs/vite-plugin-nitro` owns Nitro integration and page endpoint generation

This split is already visible in current code, not just in package boundaries:

- [`packages/platform/src/lib/router-plugin.ts`](packages/platform/src/lib/router-plugin.ts) already scans page, route, content, and page-server files, watches add/unlink changes, and rewrites runtime placeholders with discovered modules.
- [`packages/router/src/lib/provide-file-router.ts`](packages/router/src/lib/provide-file-router.ts) keeps Angular Router as the runtime authority by calling `provideRouter(routes, ...)` over the generated filesystem routes.
- [`packages/router/src/lib/routes.ts`](packages/router/src/lib/routes.ts) already owns filename-to-route normalization, optional catch-all handling, and route ordering, with the behavior covered in [`packages/router/src/lib/routes.spec.ts`](packages/router/src/lib/routes.spec.ts).
- Existing Angular-native data consumption is already centered on [`packages/router/src/lib/inject-load.ts`](packages/router/src/lib/inject-load.ts), [`packages/router/src/lib/get-load-resolver.ts`](packages/router/src/lib/get-load-resolver.ts), and the docs in [`apps/docs-app/docs/features/data-fetching/server-side-data-fetching.md`](apps/docs-app/docs/features/data-fetching/server-side-data-fetching.md) and [`apps/docs-app/docs/features/routing/overview.md`](apps/docs-app/docs/features/routing/overview.md).

This is a strong base. The feature should extend that split, not disrupt it.

## Package Ownership Recommendation

### Preferred modular split

If maintainers want stronger separation of concerns, the preferred implementation path is to modularize the internals while keeping the public API stable and Angular-native.

That means:

- introduce a shared route-manifest/codegen layer
- introduce a clearer route-generation plugin boundary
- keep Angular runtime helpers in `@analogjs/router`
- keep Nitro consumption in `@analogjs/vite-plugin-nitro`
- keep content contracts in `@analogjs/content`

The key decision is that modularization should happen primarily in the **internal build/codegen architecture**, not by fragmenting the public authoring surface.

### `@analogjs/platform`

`@analogjs/platform` should own:

- route discovery
- route watching
- generated app-local route artifacts
- TS project integration for those generated artifacts

That matches the current plugin layer: [`packages/platform/src/lib/router-plugin.ts`](packages/platform/src/lib/router-plugin.ts) is already where route discovery, watch invalidation, and placeholder generation happen today.

Candidate outputs:

- `.analog/routes.gen.ts`
- `.analog/routeTree.gen.ts`
- `.analog/routes.schema-map.gen.ts`
- `.analog/typed-router.ts`

### `@analogjs/router`

`@analogjs/router` should own:

- the stable public runtime API
- typed navigation helpers
- route-path utilities
- future route contract helpers
- typed page-load and page-action helpers if added later

That also matches current runtime ownership: [`packages/router/src/lib/provide-file-router.ts`](packages/router/src/lib/provide-file-router.ts), [`packages/router/src/lib/routes.ts`](packages/router/src/lib/routes.ts), and [`packages/router/src/lib/route-config.ts`](packages/router/src/lib/route-config.ts) already define how filesystem routes become Angular Router behavior and route-level load resolution.

### `@analogjs/content`

`@analogjs/content` should remain focused on:

- frontmatter schemas
- content resources
- markdown/content-specific typing

Content should not become the owner of generic route params/query contracts.

### No new public package, but yes to a new internal boundary

A new **public** package is still not the best answer.

However, if Analog is intentionally choosing the modular route, a new **internal** package or library boundary is justified now for the manifest/codegen layer.

The recommended modular split is:

1. internal route-manifest/codegen library
2. explicit Vite route-generation plugin boundary
3. runtime Angular APIs in `@analogjs/router`
4. Nitro integration consuming the generated contracts

This gives maintainers separation of concerns without forcing app authors to learn yet another public package.

## Preferred Modular Architecture

If Analog is intentionally choosing stronger modularization, the cleanest version is to split the problem into a manifest/codegen layer, a dedicated generation plugin boundary, a public Angular runtime layer, and a Nitro consumption layer.

This is the recommended implementation direction when separation of concerns is the priority.

### Hypothetical package and plugin split

#### `@analogjs/route-manifest` or internal `route-manifest` library

This layer would own:

- filesystem scanning normalization
- filename-to-route identity rules
- generated artifact data structures
- schema export discovery
- route collision and normalization validation

This should be internal-first rather than a public user-facing package. Its value is as a shared engine, not as a new authoring surface.

#### `@analogjs/vite-plugin-routes` or a dedicated route-generation subplugin

This layer would own:

- generation of `.analog/routes.gen.ts`
- generation of `.analog/routeTree.gen.ts`
- generation of `.analog/routes.schema-map.gen.ts`
- generation of `.analog/typed-router.ts`
- TypeScript reference integration
- watch invalidation and regeneration

This could either become:

- a new dedicated Vite plugin package, or
- a more explicitly separated subplugin within `@analogjs/platform`

If maintainers want the strongest conceptual separation, the cleaner end-state is a dedicated route-generation plugin boundary backed by the shared manifest layer. If maintainers want to delay extra package surface, the exact same boundary can start as a subplugin inside `@analogjs/platform` and graduate later.

#### `@analogjs/router`

This would still own:

- `routePath()`
- `injectTypedRouter()`
- typed URL builders
- typed route contract consumption
- future typed page-load or page-action helpers

Even in a modularized future, `@analogjs/router` should remain the public Angular-facing home of the feature.

#### `@analogjs/vite-plugin-nitro`

This layer should consume generated route manifests only where Nitro integration requires them, for example:

- page endpoint bridging
- SSR/runtime alignment checks
- future typed endpoint metadata or route-aware server helpers

It should not become the primary public typed-routing package.

#### `@analogjs/content`

This layer should remain content-specific. It can reuse route-manifest concepts only where content routes intersect with route generation, but it should not own generic route contracts.

## Two Recommended Paths: Minimal vs Modular

There are two valid architectures.

### Option A: Minimal modularization

- route generation stays in `@analogjs/platform`
- runtime helpers stay in `@analogjs/router`
- Nitro bridge stays in `@analogjs/vite-plugin-nitro`
- generated artifacts remain app-local under `.analog/`

This remains the lower-friction option, but it is no longer the preferred direction if the goal is stronger separation of concerns.

### Option B: Deliberate modularization

- introduce a shared manifest/codegen layer
- possibly introduce a dedicated Vite route-generation plugin boundary
- keep runtime APIs in `@analogjs/router`
- let Nitro consume generated manifests where needed

This is the preferred direction when maintainers want stronger ownership boundaries and expect the route-manifest/codegen system to become a real subsystem with multiple consumers.

## When A New Package Is Justified

A new **public** package becomes justified when most of the following are true:

- route manifest generation is reused by `@analogjs/platform`, `@analogjs/router`, `@analogjs/vite-plugin-nitro`, future docs/devtools, and potentially Nx/editor tooling
- route generation logic becomes large enough to obscure the existing responsibilities of `@analogjs/platform`
- maintainers want independent test coverage and ownership boundaries for route-manifest logic
- future work such as typed devtools or route diagnostics needs a reusable manifest model independent of Angular runtime helpers

Until then, a new top-level public package would likely create more maintenance burden than clarity.

By contrast, a new **internal** package or library boundary is already justified if Analog explicitly wants the modular route. In that case, the manifest/codegen layer is important enough to deserve its own ownership boundary even if it remains unpublished and framework-internal.

## What A Dedicated Vite Route Plugin Would Own

If Analog introduced a dedicated route-generation plugin boundary, it should own:

- scanning route, page, content, and page-server files
- mapping filenames to normalized route identities
- generating app-local `.analog/*` artifacts
- TS reference updates
- add/remove/change regeneration behavior
- debug logging and diagnostics for codegen

It should not own:

- Angular navigation runtime helpers
- public route consumption helpers
- Nitro transport semantics
- Standard Schema validation behavior at runtime

## What Nitro Should Consume, Not Own

Nitro should consume generated route contracts where server/runtime alignment benefits from them, but it should not become the owner of route typing.

Nitro-owned responsibilities should stay limited to:

- page endpoint generation
- request execution
- server runtime integration
- event-bound internal fetch
- SSR/prerender behavior

Nitro should not define:

- the canonical route artifact
- the public typed navigation model
- the public route contract API
- the filename normalization source of truth

## Build-Time vs Runtime Responsibilities

### Build-time generation

Build-time generation should live in the plugin layer.

Responsibilities:

- scan pages, routes, content routes, and page server files
- derive route structure from filenames
- generate app-local route artifacts
- regenerate them during dev on file add/remove/change
- update TS references as needed

This follows the existing implementation shape in [`packages/platform/src/lib/router-plugin.ts`](packages/platform/src/lib/router-plugin.ts), which already performs file discovery and regeneration-triggering work in dev.

### Runtime consumption

Runtime helpers should live in `@analogjs/router`.

Responsibilities:

- build typed `UrlTree`s
- provide typed navigation helpers
- eventually expose typed route consumption helpers
- reuse generated artifacts instead of rescanning the filesystem

This is also consistent with today's runtime split: [`packages/router/src/lib/provide-file-router.ts`](packages/router/src/lib/provide-file-router.ts) consumes generated routes through Angular Router, while [`packages/router/src/lib/route-config.ts`](packages/router/src/lib/route-config.ts) resolves page loads against generated page endpoints rather than rescanning the filesystem at runtime.

The runtime package should not infer file routes by itself.

## Generated Artifact Strategy

The generated artifact should be the source of truth for type-safe routing.

### Recommended first artifact

Start with a path-keyed type map.

Example:

```ts
export interface AnalogRouteTable {
  '/': {
    params: {};
    query: Record<string, string | string[] | undefined>;
  };
  '/users/[id]': {
    params: { id: string };
    query: Record<string, string | string[] | undefined>;
  };
  '/docs/[...slug]': {
    params: { slug: string[] };
    query: Record<string, string | string[] | undefined>;
  };
  '/shop/[[...category]]': {
    params: { category?: string[] };
    query: Record<string, string | string[] | undefined>;
  };
}
```

This is the smallest useful contract for:

- typed navigation
- typed params
- typed route path unions

### Optional richer artifact

Later, add a tree/debug artifact if it helps devtools or introspection.

Example shape:

```ts
export const routeTree = {
  '/users/[id]': {
    id: '/users/[id]',
    to: '/users/[id]',
    fullPath: '/users/[id]',
    params: ['id'],
    children: [],
  },
};
```

This should be considered secondary. The first milestone should optimize for TS ergonomics, not runtime tree traversal.

## Route Identity Model

One subtle lesson from TanStack Router is that route identity is not always just one string.

Analog should define at least these concepts explicitly:

- `fileRouteKey`
  The canonical file-derived route identity, e.g. `'/users/[id]'`
- `to`
  The navigation target identity used by typed helpers
- `fullPath`
  The fully normalized path shape
- `routeId`
  An internal or debug-friendly route identity

The exact naming can differ from TanStack, but the distinction is useful and should be deliberate.

## Filename-Derived Param Rules

These should be part of the contract and test suite from day one.

- `[id]` -> `{ id: string }`
- `[...slug]` -> `{ slug: string[] }`
- `[[...slug]]` -> `{ slug?: string[] }`

The generated types, runtime helpers, and future validation layer should all agree on these semantics.

Angular should still retain an escape hatch for route shapes that are not purely filename-derived. Angular's router already supports custom `UrlMatcher` logic and `posParams`, and its docs explicitly show `withComponentInputBinding()` consuming matcher-defined params as component inputs. That is a strong reason to keep filename-derived contracts as the default model without pretending they cover every advanced matching case. See [`frameworks/angular-main/adev/src/content/guide/routing/routing-with-urlmatcher.md`](frameworks/angular-main/adev/src/content/guide/routing/routing-with-urlmatcher.md).

## Query Param Strategy

Filename parsing cannot infer query keys, so the default query model should be intentionally loose:

```ts
query: Record<string, string | string[] | undefined>;
```

This gives:

- useful param typing immediately
- no schema requirement
- a migration path to richer contracts later

This also matches current validation semantics instead of inventing a new query model. [`apps/docs-app/docs/features/data-fetching/validation.md`](apps/docs-app/docs/features/data-fetching/validation.md) explicitly documents that repeated query keys and repeated form fields are preserved as arrays, and the implementation in [`packages/router/server/actions/src/parse-request-data.ts`](packages/router/server/actions/src/parse-request-data.ts) plus tests in [`packages/router/server/actions/src/define-api-route.spec.ts`](packages/router/server/actions/src/define-api-route.spec.ts) and [`packages/router/server/actions/src/define-action.spec.ts`](packages/router/server/actions/src/define-action.spec.ts) already enforce that behavior.

It also fits Angular's own route-state model. Angular docs describe query params as optional URL state that affects component behavior without changing which component loads, and the router testing guide calls out that query params can change independently from route params. That is a strong argument for keeping the unschematized default intentionally loose. See [`frameworks/angular-main/adev/src/content/guide/routing/read-route-state.md`](frameworks/angular-main/adev/src/content/guide/routing/read-route-state.md) and [`frameworks/angular-main/adev/src/content/guide/routing/testing.md`](frameworks/angular-main/adev/src/content/guide/routing/testing.md).

Angular's current type surface also shows why generated contracts are needed here. In router source, `Params` is still `{ [key: string]: any }` and `ParamMap.get(name: string)` returns `string | null`, so Angular exposes route/query state ergonomically but not as a route-contract-typed API. See [`frameworks/angular-main/packages/router/src/shared.ts`](frameworks/angular-main/packages/router/src/shared.ts).

When a route exports `routeQuerySchema`, that default can be refined.

## Route Contract Exports

Routes should be able to opt into richer contracts by exporting schemas.

### Proposed route-level exports

```ts
import * as v from 'valibot';

export const routeParamsSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^\d+$/)),
});

export const routeQuerySchema = v.object({
  tab: v.optional(v.picklist(['profile', 'settings'])),
});
```

### Contract semantics

- filename defines presence and cardinality
- schema refines allowed values
- schema can provide transforms and defaults
- schemas are optional

## Input vs Output Types

This is one of the most important ideas to borrow from TanStack Router.

The most relevant references here are TanStack's search-validation guide in [`frameworks/router-main/docs/router/how-to/validate-search-params.md`](frameworks/router-main/docs/router/how-to/validate-search-params.md) and its shared navigation contract in [`frameworks/router-main/docs/router/guide/navigation.md`](frameworks/router-main/docs/router/guide/navigation.md): both treat navigation input and runtime-consumed route state as related but not identical concerns.

Navigation should use schema input types.
Runtime reads should use schema output types.

Why:

- building a URL may start from raw strings
- runtime consumption often wants coerced values, defaults, or transformations

Example:

```ts
'/users/[id]': {
  params: InferInput<typeof routeParamsSchema>;
  query: InferInput<typeof routeQuerySchema>;
}
```

Then runtime APIs can expose:

```ts
type RouteRuntimeParams = InferOutput<typeof routeParamsSchema>;
type RouteRuntimeQuery = InferOutput<typeof routeQuerySchema>;
```

This is a better model than forcing navigation and runtime consumption to share the same shape.

Angular already has a natural consumption seam for these runtime output types. `ActivatedRoute` exposes params, query params, and resolved data at runtime, while `withComponentInputBinding()` can bind query params, path params, static route data, and resolver output directly into component inputs. Typed file-route contracts should feed that Angular-native seam rather than create a parallel runtime mental model. See [`frameworks/angular-main/adev/src/content/guide/routing/read-route-state.md`](frameworks/angular-main/adev/src/content/guide/routing/read-route-state.md), [`frameworks/angular-main/adev/src/content/guide/routing/data-resolvers.md`](frameworks/angular-main/adev/src/content/guide/routing/data-resolvers.md), and [`frameworks/angular-main/packages/router/src/provide_router.ts`](frameworks/angular-main/packages/router/src/provide_router.ts).

## Proposed Public API

The public API should stay Angular-native and minimal.

### Recommended shape

```ts
const router = injectTypedRouter();

router.navigate('/users/[id]', {
  params: { id: '42' },
  query: { tab: 'profile' },
});
```

And:

```ts
const url = routePath('/users/[id]', {
  params: { id: '42' },
  query: { tab: 'profile' },
});
```

### Why this shape

- it wraps Angular Router instead of replacing it
- it feels path-first, which matches Analog’s file-routing model
- it is easy to map onto `UrlTree`, `navigate`, and `navigateByUrl`

This shape also lines up with Angular's existing navigation vocabulary. Angular documents `RouterLink` as accepting a string or link-parameters array, and `Router.navigate()` as taking a path array plus extras. In source, that flexibility is implemented with broad inputs like `readonly any[] | string | UrlTree`, which is powerful at runtime but not route-contract typed at compile time. Generated Analog helpers can add that missing contract layer while still compiling down to the normal Angular router calls. See [`frameworks/angular-main/adev/src/content/guide/routing/router-reference.md`](frameworks/angular-main/adev/src/content/guide/routing/router-reference.md), [`frameworks/angular-main/adev/src/content/guide/routing/navigate-to-routes.md`](frameworks/angular-main/adev/src/content/guide/routing/navigate-to-routes.md), [`frameworks/angular-main/packages/router/src/directives/router_link.ts`](frameworks/angular-main/packages/router/src/directives/router_link.ts), and [`frameworks/angular-main/packages/router/src/router.ts`](frameworks/angular-main/packages/router/src/router.ts).

This is also where Analog should borrow TanStack's `linkOptions` insight without copying its runtime model. [`frameworks/router-main/docs/router/guide/link-options.md`](frameworks/router-main/docs/router/guide/link-options.md) is strong evidence that reusable, eagerly type-checked navigation objects are high-value, but Analog should expose them through Angular-friendly path-first helpers.

### Later possibilities

- typed `RouterLink` helpers
- typed `UrlTree` builders
- typed redirect helpers

## What Should Not Be Public

The following should remain internal or secondary:

- raw dynamic import maps
- private page endpoint transport paths like `/_analog/pages/*`
- Nitro-specific route handling details
- raw h3 transport shapes for params/query

## Runtime Validation Placement

Validation should happen where runtime data enters:

- route activation/loaders
- server actions
- API routes
- content parsing

Runtime validation should not be required on every navigation.

Compile-time guarantees should carry most of the navigation safety burden.

## Page Contracts vs API Contracts

These are related, but not identical.

### Page route contracts

Page route contracts should model:

- params
- query
- load input
- load output
- action input/output

That matches Angular's page-side abstractions better than an HTTP-first contract. Angular's public routing surface for pages is already centered on `ActivatedRoute`, resolver output, and component input binding rather than request/response objects, so page contracts should extend that model instead of introducing a transport-shaped authoring API. See [`frameworks/angular-main/adev/src/content/guide/routing/router-reference.md`](frameworks/angular-main/adev/src/content/guide/routing/router-reference.md) and [`frameworks/angular-main/adev/src/content/guide/routing/data-resolvers.md`](frameworks/angular-main/adev/src/content/guide/routing/data-resolvers.md).

### API route contracts

API route contracts should model:

- method
- params
- query
- body
- output

Typed file routes should not collapse those two models into one abstraction.

## Reuse With Existing Validation Surface

The same route-level schemas should be reusable in current router/server APIs.

This is already the direction of the platform. [`packages/router/server/actions/src/define-action.ts`](packages/router/server/actions/src/define-action.ts) validates `params` independently before the action handler runs. [`packages/router/server/actions/src/define-api-route.ts`](packages/router/server/actions/src/define-api-route.ts) already validates `params`, `query`, and `body` separately while exposing typed validated values. [`packages/router/src/lib/validation-errors.ts`](packages/router/src/lib/validation-errors.ts) already bridges `StandardSchemaV1.Issue[]` into field-friendly errors, and [`apps/docs-app/docs/features/data-fetching/validation.md`](apps/docs-app/docs/features/data-fetching/validation.md) shows the same contract language spanning actions, API routes, and content parsing.

### Server actions

```ts
export const action = defineAction({
  schema: UpdateUserSchema,
  params: routeParamsSchema,
  handler: async ({ data, params }) => {
    await updateUser(params.id, data);
    return json({ ok: true });
  },
});
```

### API routes

```ts
export default defineApiRoute({
  params: routeParamsSchema,
  query: routeQuerySchema,
  body: UpdateUserSchema,
  handler: async ({ params, query, body }) => {
    return updateUser(params.id, body, query.tab);
  },
});
```

### Future page loads

```ts
export const load = definePageLoad({
  params: routeParamsSchema,
  query: routeQuerySchema,
  handler: async ({ params, query }) => {
    return fetchUser(params.id, query.tab);
  },
});
```

This is what makes the feature more powerful than typed links alone.

## Nitro And h3 Considerations

Typed file routes must respect how Analog already runs on Nitro and h3.

### Architectural stance

- Nitro and h3 are the runtime transport and execution substrate
- Angular Router remains the client/runtime navigation authority
- generated route artifacts are a build-time contract
- `@analogjs/router` remains the public authoring surface

That separation is already reflected in current code: [`packages/router/src/lib/provide-file-router.ts`](packages/router/src/lib/provide-file-router.ts) keeps Angular Router in charge of client/runtime navigation, while [`packages/vite-plugin-nitro/src/lib/utils/get-page-handlers.ts`](packages/vite-plugin-nitro/src/lib/utils/get-page-handlers.ts) generates private `/_analog/pages/*` Nitro handlers that are consumed from [`packages/router/src/lib/route-config.ts`](packages/router/src/lib/route-config.ts).

Typed file routes should not expose Nitro/h3 details as the primary user API, but they must align with how Nitro/h3 actually handles params, query, requests, and internal fetches.

Generated route artifacts should therefore sit _above_ the Nitro/h3 transport layer:

- route manifests are the canonical source of type information
- Angular helpers consume them on the client/runtime side
- Nitro handlers consume them on the server/runtime side only where alignment is needed

Nitro should consume route contracts, not define them.

## Nitro/h3 Best Practices For Analog

### 1. Use public Nitro/h3 APIs

Prefer public Nitro/h3 primitives and keep private internals out of the design.

Good primitives to align with:

- `defineHandler()`
- `H3Event`
- `event.context.params`
- `event.url.searchParams`
- event-bound fetch helpers like `fetchWithEvent`

### 2. Keep internal fetch event-bound

Internal requests should preserve:

- cookies
- headers
- auth context
- request-local state
- Nitro internal routing behavior

Typed route helpers should not accidentally normalize everything into detached plain fetch calls.

This matters even more in a modular architecture. If a dedicated route plugin emits contracts and `@analogjs/vite-plugin-nitro` consumes them, the Nitro side still needs event-bound fetch and request-context propagation. The generated manifest should not tempt implementation code into "plain fetch plus string URL" shortcuts that drop cookies, auth state, or server context.

### 3. Preserve multiplicity in query/form parsing

Analog’s current request parsing preserves repeated values as arrays. Typed route contracts should preserve that behavior and not collapse repeated keys to a scalar unless a schema explicitly chooses to do so.

### 4. Normalize params at the contract boundary

h3 params are raw strings by default. Route contracts should normalize those values at the earliest typed boundary so downstream consumers operate on domain types, not transport strings.

### 5. Keep page endpoint transport private

The private `/_analog/pages/*` transport is an implementation detail. Typed route contracts should model page route semantics, not the hidden endpoint shape.

This also means Nitro page endpoints should consume route contracts without becoming the source of truth. The user-facing model should remain:

- file route
- generated route artifact
- Angular route helper / route contract

and only then:

- Nitro-generated page endpoint implementation detail

### 6. Separate route contracts from render policy

SSR, SSG, route rules, and caching policy should stay in Nitro/platform concerns, not inside route param/query schema contracts.

### 7. Keep page contracts and API contracts distinct

Page route contracts and API route contracts can share schemas, but they should not collapse into one type model.

Nitro is the execution substrate for both, but they have different public concerns:

- page contracts are navigation- and render-oriented
- API contracts are HTTP- and transport-oriented

That distinction becomes even more important if a modularized architecture is introduced, because it prevents the Nitro layer from accidentally turning page routes into API-first abstractions.

## Current Nitro/h3 Risks To Resolve

There are a few important issues to keep in mind when implementing this feature deeply.

### Query-loss risk in server-side internal page loads

The current asymmetry is narrower than "all internal fetches", but it is real for page-load endpoint fetching. In [`packages/router/src/lib/route-config.ts`](packages/router/src/lib/route-config.ts), resolver-side page loads call `internalFetch(url.pathname)` and `$fetch(url.pathname)`, while the `HttpClient` path uses `url.href`. By contrast, [`packages/router/src/lib/request-context.ts`](packages/router/src/lib/request-context.ts) preserves `requestUrl.searchParams` for server-side `HttpClient` internal fetches. That means the specific risk is page-load endpoint paths that rely on `url.pathname`, where SSR/prerender behavior can diverge from browser behavior for query-aware loads.

This should be fixed before heavily relying on typed page query contracts.

### `req`/`res` typing mismatch

Some page server types imply raw request/response objects are always available, but Nitro/prerender contexts can make those absent. Typed route and load contracts should not hardcode assumptions that are not always true in Nitro execution.

### Route-group normalization consistency

Any generated artifact must exactly match the same filename normalization rules already used by the existing router and page-endpoint pipeline. If generation and runtime normalization drift, typed routing becomes a source of false confidence.

The evidence for that constraint is already in the codebase: [`packages/router/src/lib/routes.ts`](packages/router/src/lib/routes.ts) and [`packages/vite-plugin-nitro/src/lib/utils/get-page-handlers.ts`](packages/vite-plugin-nitro/src/lib/utils/get-page-handlers.ts) both normalize route groups, params, catch-alls, and dotted segments today, and [`packages/router/src/lib/routes.spec.ts`](packages/router/src/lib/routes.spec.ts) already covers optional catch-all and nested normalization behavior.

In a modularized future, this is a strong argument for a single shared route-manifest normalization engine. If multiple packages re-implement normalization logic, typed route generation becomes brittle very quickly.

## Loader And Revalidation Model

The next major design decision after basic typed navigation is how typed URL state affects route data loading.

### Recommended lifecycle

1. Match filename-derived route
2. Parse filename-derived params shape
3. Apply optional `routeParamsSchema`
4. Apply optional `routeQuerySchema`
5. Run route guard/preload logic
6. Execute typed load/resolver contract
7. Render

### Recommended v1 scope

For v1:

- type the inputs to route loads
- do not build a large router-owned cache yet
- keep invalidation/reload behavior explicit and conservative

Angular already has useful semantics to anchor this decision. Resolvers run before activation, `withComponentInputBinding()` can project resolved data plus URL state into components, and `runGuardsAndResolvers` already distinguishes param-driven reruns from query-driven reruns. In particular, Angular's default `paramsChange` behavior excludes query params, while other options explicitly include them. That makes Angular a better framing device for future `loaderDeps`-style behavior than importing another router's cache model directly. See [`frameworks/angular-main/adev/src/content/guide/routing/data-resolvers.md`](frameworks/angular-main/adev/src/content/guide/routing/data-resolvers.md), [`frameworks/angular-main/packages/router/src/models.ts`](frameworks/angular-main/packages/router/src/models.ts), and [`frameworks/angular-main/packages/router/src/provide_router.ts`](frameworks/angular-main/packages/router/src/provide_router.ts).

### Future enhancement

Later, add a `loaderDeps`-style concept in Angular terms so query-derived data dependencies are declared, typed, and inspectable. The key idea worth borrowing from TanStack is in [`frameworks/router-main/docs/router/guide/data-loading.md`](frameworks/router-main/docs/router/guide/data-loading.md): validated search state becomes operationally meaningful when reload behavior depends on explicitly declared URL inputs instead of incidental URL churn. Analog should adapt that idea through Angular resolver/load semantics, not by importing TanStack's router cache or route-module model.

## Devtools And Diagnostics

This feature will be much stronger if it is inspectable.

Good future devtools targets:

- route tree viewer
- active route match
- resolved params
- resolved query
- applied schemas
- validation failures
- load timing and load status
- generated artifact inspection

Good future diagnostics:

- mismatched filename shape vs schema
- duplicate route identities
- invalid catch-all contract definitions
- warnings when route contracts are declared but cannot be consumed

## Generated File Responsibilities

### `.analog/routes.gen.ts`

Owns:

- route path union
- param shape
- default query shape
- route identity metadata

### `.analog/routes.schema-map.gen.ts`

Owns:

- references to optional route schemas
- mapping from route identity to schema-bearing module exports

This can remain internal or semi-internal at first.

### `.analog/typed-router.ts`

Owns:

- app-local typed facade over stable `@analogjs/router` helpers
- ergonomics for app code

This is a strong optional convenience layer.

## Testing Strategy

This feature needs more than ordinary unit tests.

### Codegen tests

- generated artifact snapshots
- route identity stability
- route normalization consistency
- add/remove/change regeneration behavior

### Type tests

- missing required params fail
- extra params fail
- catch-all shapes are correct
- query input/output distinction behaves as designed

### Integration tests

- Angular Router navigation helpers
- `RouterLink`-adjacent usage
- SSR and client consistency
- page loads with query params
- page actions and API routes sharing route contracts

### Nitro/h3 integration tests

- event-bound internal fetch
- params/query parity across browser and SSR
- repeated query key handling
- raw `Response` escape hatches remain intact

## Suggested Rollout

### Milestone 1

- generated route artifact from filenames
- path-keyed route table
- `routePath()`
- `injectTypedRouter()` or equivalent

### Milestone 2

- support all dynamic route forms
- route identity model clarified
- TS integration and regeneration polish
- docs for typed navigation

### Milestone 3

- optional `routeParamsSchema`
- optional `routeQuerySchema`
- input/output schema distinction
- integration with existing validation docs and APIs

### Milestone 4

- typed page-load contracts
- loader dependency model
- diagnostics/devtools surface

## Migration Story

### Existing users

No breaking changes:

- existing `router.navigate()` still works
- existing file routes still work
- no schema is required
- no Angular Router feature is replaced

That migration story is credible because Angular's existing router entrypoints remain the same. Apps still configure routing through `provideRouter()`, template navigation still flows through `RouterLink`, and programmatic navigation still flows through `Router.navigate()` / `navigateByUrl()`. Typed file routes simply add generated contracts and helpers on top of that runtime model. See [`frameworks/angular-main/adev/src/content/guide/routing/router-reference.md`](frameworks/angular-main/adev/src/content/guide/routing/router-reference.md), [`frameworks/angular-main/adev/src/content/guide/routing/navigate-to-routes.md`](frameworks/angular-main/adev/src/content/guide/routing/navigate-to-routes.md), and [`frameworks/angular-main/packages/router/src/router.ts`](frameworks/angular-main/packages/router/src/router.ts).

### Adoption path

1. enable/generated route artifacts
2. adopt typed path/url helpers
3. adopt typed router helper
4. optionally add route params/query schemas
5. optionally reuse those schemas in actions, APIs, and loads

## Decision Log: What We Are Not Copying

- We are not building a new router.
- We are not making route names the primary public API.
- We are not requiring schemas for all routes.
- We are not defaulting to aggressive runtime validation during every navigation.
- We are not importing TanStack’s hook-centric route module model.
- We are not exposing Nitro page transport URLs as part of the public route contract.
- We are not moving the public typed-routing authoring surface into Nitro or h3 APIs.
- We are not creating a new public `typed-router` package unless the manifest/codegen layer becomes large and independently reusable enough to justify it.
- We are not making a dedicated route-generation plugin package the default answer if the existing `@analogjs/platform` plugin boundary stays maintainable.

## Notes On Research Inputs

The local `research/` corpus was reviewed, but it did not contain meaningful Nitro/h3-specific implementation guidance for this problem. The most relevant practical guidance came from:

- Analog implementation references such as [`packages/platform/src/lib/router-plugin.ts`](packages/platform/src/lib/router-plugin.ts), [`packages/router/src/lib/routes.ts`](packages/router/src/lib/routes.ts), [`packages/router/src/lib/route-config.ts`](packages/router/src/lib/route-config.ts), [`packages/router/server/actions/src/define-action.ts`](packages/router/server/actions/src/define-action.ts), and [`packages/router/server/actions/src/define-api-route.ts`](packages/router/server/actions/src/define-api-route.ts)
- Analog docs references such as [`apps/docs-app/docs/features/routing/overview.md`](apps/docs-app/docs/features/routing/overview.md), [`apps/docs-app/docs/features/data-fetching/server-side-data-fetching.md`](apps/docs-app/docs/features/data-fetching/server-side-data-fetching.md), and [`apps/docs-app/docs/features/data-fetching/validation.md`](apps/docs-app/docs/features/data-fetching/validation.md)
- TanStack Router references such as [`frameworks/router-main/docs/router/guide/navigation.md`](frameworks/router-main/docs/router/guide/navigation.md), [`frameworks/router-main/docs/router/guide/link-options.md`](frameworks/router-main/docs/router/guide/link-options.md), [`frameworks/router-main/docs/router/guide/data-loading.md`](frameworks/router-main/docs/router/guide/data-loading.md), and [`frameworks/router-main/docs/router/how-to/validate-search-params.md`](frameworks/router-main/docs/router/how-to/validate-search-params.md)
- Nuxt typed-routing references such as [`frameworks/nuxt-main/docs/3.guide/6.going-further/1.experimental-features.md`](frameworks/nuxt-main/docs/3.guide/6.going-further/1.experimental-features.md) and [`frameworks/nuxt-main/test/typed-router.test.ts`](frameworks/nuxt-main/test/typed-router.test.ts)

That means this document should stay grounded in Analog’s actual implementation shape rather than trying to force generic research corpus patterns onto the feature.

## Why This Is Strong

This would let Analog offer something differentiated:

- Angular-native file-based route typing
- generated route artifacts as a first-class product feature
- optional route contracts instead of mandatory ceremony
- end-to-end reuse of schemas across navigation, actions, APIs, and data loading
- a path to rich diagnostics and devtools without abandoning Angular Router

That is a much stronger story than typed paths alone, and it fits the maintainer preference for strong separation of concerns:

- plugin layer generates
- router layer exposes
- Nitro/h3 transports
- content stays content-specific

## Recommended Path

If Analog is explicitly choosing the modular route, the recommended path is:

- introduce a shared route-manifest/codegen layer now
- give route generation an explicit plugin boundary
- keep public runtime APIs in `@analogjs/router`
- keep Nitro consumption in `@analogjs/vite-plugin-nitro`
- keep content contracts in `@analogjs/content`

The most maintainable concrete version of that modular path is:

1. add an internal `route-manifest` library or package
2. implement a dedicated route-generation plugin boundary on top of it
3. emit app-local `.analog/*` artifacts from that plugin
4. let `@analogjs/router` consume those artifacts for typed navigation and route contracts
5. let `@analogjs/vite-plugin-nitro` consume those artifacts only where server/runtime alignment needs them

The fallback option, if maintainers want to postpone extra package boundaries, is to keep the same architecture conceptually but host the route-generation plugin boundary inside `@analogjs/platform` first.

That is the key conclusion of this document: if Analog modularizes, it should modularize the manifest/codegen and plugin layers, while still keeping the public API Angular-native and router-centered rather than shifting toward a Nitro-first or package-fragmented model.
