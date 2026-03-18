# Ng-Native Typed File Routes

> **Status:** Active implementation on `feat/file-based-routing-type-safe`
> **Tracking:** [analogjs/analog#2044](https://github.com/analogjs/analog/issues/2044)
> **Base branch:** `alpha`

---

## Overview

Analog now has a typed file-based routing system that gives Angular developers compile-time type-safe navigation, typed route params and query params, optional runtime validation using Standard Schema, and a rich generated route tree — all while keeping Angular Router as the runtime authority.

This document is the canonical reference for the feature's design rationale, implementation status, public API surface, and forward roadmap.

---

## Design Principles

> **The file system is the source of route structure.**
> Schemas are optional refinements, not the base requirement.
> Generated helpers wrap Angular Router — they never replace it.
> Compile-time and runtime compose, but each is independently useful.

These principles keep the feature Angular-native while borrowing the strongest ideas from competitors.

---

## Inspiration & Credit

This feature draws directly on ideas from several frameworks that were studied during design and implementation. The full research corpus is in `../analog-research/zFrameworks/`.

### TanStack Router

> _"The strongest direct product reference."_

The most influential ideas borrowed from [TanStack Router](https://tanstack.com/router) (`zFrameworks/tanstack/router-main/`):

- **Generated route artifact as a first-class contract** — TanStack's `routeTree.gen.ts` pattern proved that a machine-owned generated file is the right primary artifact for typed routing. Analog adopted this pattern directly, generating `src/routeTree.gen.ts` with module augmentation.

- **Input vs output type distinction** — TanStack separates navigation input types (`fullSearchSchemaInput`) from runtime output types (`fullSearchSchema`). Analog mirrors this with `params` / `paramsOutput` and `query` / `queryOutput` in the generated route table, ensuring navigation always uses strings while runtime consumption can use coerced/validated types.

- **`useParams({ from })` and `useSearch({ from })`** — The `from` parameter pattern for constraining return types by route path inspired `injectParams('/path')` and `injectQuery('/path')`.

- **Root route context** — `createRootRouteWithContext<T>()` inspired `withRouteContext()` and `injectRouteContext()`, adapted to Angular's DI model.

- **Route identity model** — The distinction between `id`, `path`, `fullPath`, and `to` was borrowed and adapted for the generated route tree metadata.

Key references studied:

- `zFrameworks/tanstack/router-main/docs/router/guide/navigation.md`
- `zFrameworks/tanstack/router-main/docs/router/guide/link-options.md`
- `zFrameworks/tanstack/router-main/docs/router/guide/data-loading.md`
- `zFrameworks/tanstack/router-main/docs/router/how-to/validate-search-params.md`

### Nuxt

> _"The best operational reference for typed routes."_

[Nuxt](https://nuxt.com/) (`zFrameworks/nuxt-main/`) demonstrated:

- **Build-integrated type generation** — Nuxt generates route typings automatically during dev/build and wires them into the TypeScript program. Analog follows the same pattern with Vite plugin watch integration.

- **Broad propagation of typed routing** — Nuxt proved that generated types should flow into all major route entrypoints, not just a single helper. Analog propagates types through `routePath()`, `injectNavigate()` / `injectNavigateByUrl()`, `injectParams()`, `injectQuery()`, and `definePageLoad()`.

Key references studied:

- `zFrameworks/nuxt-main/docs/3.guide/6.going-further/1.experimental-features.md`
- `zFrameworks/nuxt-main/test/typed-router.test.ts`

### Astro

> _"Less useful as a public typed-routing model, but valuable as an internal engine reference."_

[Astro](https://astro.build/) (`zFrameworks/astro-main/`) contributed:

- **Manifest discipline** — Astro's careful route-manifest generation, route collision handling, and watch/rebuild robustness influenced the design of `generateRouteManifest()` with collision warnings and deterministic sorting.

- **Internal diagnostics** — Astro's approach to build-time diagnostics inspired `formatManifestSummary()`.

### Angular Router

> _"The runtime authority."_

Angular's own router source and documentation (`zFrameworks/angular-main/`) confirmed the design direction:

- **Angular Router remains the runtime** — `provideRouter()`, `RouterLink`, `Router.navigate()`, `ActivatedRoute` remain the canonical primitives. Typed file routes are a generated contract layer over those APIs.

- **`withComponentInputBinding()`** — Angular's ability to bind route params, query params, and resolver output directly into component inputs provides a natural consumption seam for typed route contracts.

- **`runGuardsAndResolvers`** — Angular's existing distinction between param-driven and query-driven reruns provides better framing for future `loaderDeps`-style behavior than importing TanStack's cache model.

Key references studied:

- `zFrameworks/angular-main/adev/src/content/guide/routing/router-reference.md`
- `zFrameworks/angular-main/adev/src/content/guide/routing/navigate-to-routes.md`
- `zFrameworks/angular-main/adev/src/content/guide/routing/read-route-state.md`
- `zFrameworks/angular-main/packages/router/src/router.ts`
- `zFrameworks/angular-main/packages/router/src/directives/router_link.ts`

---

## Architecture

### Package Ownership

```
┌──────────────────────────────────┐
│  @analogjs/platform              │  Route generation, codegen, and manifest
│  typed-routes-plugin.ts          │  Generates src/routeTree.gen.ts
│  route-generation-plugin.ts      │  Wired via experimental.typedRouter
│  filenameToRoutePath()           │  Route normalization
│  filenameToRouteId()             │  Structural identity
│  generateRouteManifest()         │  Manifest from filenames
│  generateRouteTableDeclaration() │  AnalogRouteTable codegen
│  generateRouteTreeDeclaration()  │  Route tree metadata codegen
│  detectSchemaExports()           │  Schema detection
│  formatManifestSummary()         │  Build diagnostics
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  @analogjs/router                │  Public Angular-facing runtime API
│  routePath()                     │  Type-safe route object (path + routerLinkOptions)
│  injectNavigate()                │  Type-safe wrapper around Router.navigate()
│  injectNavigateByUrl()           │  Type-safe wrapper around Router.navigateByUrl()
│  injectParams()                  │  Typed params signal
│  injectQuery()                   │  Typed query signal
│  RouteParamsOutput<P>            │  Validated params type utility
│  RouteQueryOutput<P>             │  Validated query type utility
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  @analogjs/router/server/actions │  Server-side runtime
│  definePageLoad()                │  Typed page load with validation
│  defineAction()                  │  Server actions with validation
│  defineApiRoute()                │  API routes with validation
└──────────────────────────────────┘
```

### Generated Output

The platform plugin generates a single canonical file at `src/routeTree.gen.ts` containing two layers:

**Layer 1 — Typed Navigation Table** (always present)

```ts
declare module '@analogjs/router' {
  interface AnalogRouteTable {
    '/users/[id]': {
      params: { id: string };
      paramsOutput: { id: string };
      query: Record<string, string | string[] | undefined>;
      queryOutput: Record<string, string | string[] | undefined>;
    };
  }
}
```

When a route exports `routeParamsSchema` or `routeQuerySchema`, the generated file imports those schemas and uses `StandardSchemaV1.InferOutput` for the output types.

**Layer 2 — Route Tree Metadata** (always present)

```ts
export interface AnalogGeneratedRouteRecord<
  TId extends string = string,
  TPath extends string = string,
  TFullPath extends string = string,
  TParentId extends string | null = string | null,
  TChildren extends readonly string[] = readonly string[],
> {
  id: TId;
  path: TPath;
  fullPath: TFullPath;
  parentId: TParentId;
  children: TChildren;
  sourceFile: string;
  kind: 'page' | 'content';
  hasParamsSchema: boolean;
  hasQuerySchema: boolean;
  isIndex: boolean;
  isGroup: boolean;
  isCatchAll: boolean;
  isOptionalCatchAll: boolean;
}

export interface AnalogFileRoutesById {
  /* literal-typed entries */
}
export interface AnalogFileRoutesByFullPath {
  /* maps fullPath → id */
}
export interface AnalogFileRoutesByTo {
  /* maps to → id */
}

export const analogRouteTree = {
  byId: {
    /* runtime-accessible metadata per route */
  },
  byFullPath: {
    /* fullPath → id lookup */
  },
  byTo: {
    /* to → id lookup */
  },
} as const;
```

### Route Identity Model

> _Borrowed from TanStack Router's distinction between route identity concepts._

| Concept    | Purpose                                        | Example         |
| ---------- | ---------------------------------------------- | --------------- |
| `id`       | Stable structural identity preserving groups   | `/(auth)/login` |
| `path`     | Local segment relative to nearest parent       | `login`         |
| `fullPath` | Resolved navigation path (key for route table) | `/login`        |
| `to`       | Navigation target (matches `fullPath` in v1)   | `/login`        |

---

## Public API Reference

### `@analogjs/router` — Runtime

| Export                      | Kind      | Purpose                                           |
| --------------------------- | --------- | ------------------------------------------------- |
| `routePath(path, options?)` | function  | Returns `{ path, ...routerLinkOptions }`          |
| `injectNavigate()`          | function  | Type-safe wrapper around `Router.navigate()`      |
| `injectNavigateByUrl()`     | function  | Type-safe wrapper around `Router.navigateByUrl()` |
| `injectParams(from)`        | function  | Typed params signal (experimental)                |
| `injectQuery(from)`         | function  | Typed query signal (experimental)                 |
| `RouteParamsOutput<P>`      | type      | Validated params type for a route                 |
| `RouteQueryOutput<P>`       | type      | Validated query type for a route                  |
| `AnalogRouteTable`          | interface | Augmented by generated code                       |
| `AnalogRoutePath`           | type      | Union of valid route paths                        |

### `@analogjs/router/server/actions` — Server

| Export                    | Kind     | Purpose                                |
| ------------------------- | -------- | -------------------------------------- |
| `definePageLoad(options)` | function | Typed page load with schema validation |
| `defineAction(options)`   | function | Server action with validation          |
| `defineApiRoute(options)` | function | API route with validation              |

### `@analogjs/platform` — Build & Codegen

| Export                                             | Kind     | Purpose                                                    |
| -------------------------------------------------- | -------- | ---------------------------------------------------------- |
| `typedRoutesPlugin(options?)`                      | function | Vite plugin that generates `src/routeTree.gen.ts`          |
| `routeGenerationPlugin(options?)`                  | function | Wires `typedRoutesPlugin()` via `experimental.typedRouter` |
| `filenameToRoutePath(filename)`                    | function | Convert filename to route path                             |
| `filenameToRouteId(filename)`                      | function | Convert filename to structural id                          |
| `extractRouteParams(path)`                         | function | Extract param metadata from path                           |
| `generateRouteManifest(files, detector?)`          | function | Build manifest from files                                  |
| `generateRouteTableDeclaration(manifest)`          | function | Generate TS route table                                    |
| `generateRouteTreeDeclaration(manifest, options?)` | function | Generate TS route tree module                              |
| `detectSchemaExports(content)`                     | function | Detect schema exports in file                              |
| `formatManifestSummary(manifest)`                  | function | Human-readable build summary                               |

---

## Filename-Derived Param Rules

These rules are tested and enforced across the manifest engine, codegen, and URL builder:

| Filename pattern | Param shape            | Example path                   |
| ---------------- | ---------------------- | ------------------------------ |
| `[id]`           | `{ id: string }`       | `/users/[id]`                  |
| `[...slug]`      | `{ slug: string[] }`   | `/docs/[...slug]`              |
| `[[...slug]]`    | `{ slug?: string[] }`  | `/shop/[[...category]]`        |
| `(group)/file`   | _(stripped from path)_ | `/(auth)/login` → `/login`     |
| `dot.notation`   | _(becomes nesting)_    | `blog.[slug]` → `/blog/[slug]` |

---

## Type Flow

```
1. File: src/app/pages/users/[id].page.ts
   └── Export: routeParamsSchema = v.object({ id: v.pipe(v.string(), ...) })

2. Build (experimental.typedRouter: true):
   └── Generates src/routeTree.gen.ts
       └── Augments AnalogRouteTable:
           '/users/[id]': {
             params: { id: string }                        // navigation input
             paramsOutput: InferOutput<typeof schema>       // runtime output
           }

3. Runtime:
   ├── routePath('/users/[id]', { params: { id: '42' } })
   │     → { path: '/users/42', queryParams, fragment, ... }    ✅ typed route object w/ routerLinkOptions
   ├── navigate('/users/[id]', { params: { id: 42 } })          ❌ type error
   ├── navigate('/users/[id]', { params: { id: '42' } })        ✅ typed (via injectNavigate())
   ├── injectParams('/users/[id]')  → Signal<{ id: string }>
   └── template: [routerLink]="usersRoute.path"                 ✅ typed (from routePath)
```

> The input/output distinction is one of the most important ideas borrowed from TanStack Router. Navigation always uses strings (URLs are text). Runtime consumption uses validated/coerced types. A schema with `v.transform(Number)` has `input: string` but `output: number` — you can't put a number in a URL.

---

## Setup

### Quick Start

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [
    analog({
      experimental: {
        typedRouter: true,
      },
    }),
  ],
}));
```

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideFileRouter } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter()],
};
```

### Configuration Options

| Option                  | Default                  | Description                            |
| ----------------------- | ------------------------ | -------------------------------------- |
| `outFile`               | `'src/routeTree.gen.ts'` | Output path for generated declarations |
| `additionalPagesDirs`   | `[]`                     | Extra page directories to scan         |
| `additionalContentDirs` | `[]`                     | Extra content directories to scan      |
| `workspaceRoot`         | `process.cwd()`          | Workspace root for path resolution     |

---

## Rendering Modes

Typed routes work across all Analog rendering modes. The route type generation is rendering-mode agnostic — all routes are typed regardless of how they render.

### SSR (Server-Side Rendering)

The default mode. Routes render on the server at request time.

**How typed routes interact:**

- `routeTree.gen.ts` is generated at build time; types are available during compilation regardless of SSR
- `definePageLoad()` handlers execute on the server with access to `fetch`, `event`, `request`, and `response`
- Schema-validated params (`routeParamsSchema`) are coerced on the server before reaching `handler`

```ts
// src/app/pages/products.[productId].server.ts
import { definePageLoad } from '@analogjs/router/server/actions';
import * as v from 'valibot';

export const routeParamsSchema = v.object({
  productId: v.pipe(v.string(), v.regex(/^\d+$/)),
});

export const load = definePageLoad({
  params: routeParamsSchema,
  handler: async ({ params, fetch }) => {
    // params.productId is validated and typed
    return fetch(`/api/products/${params.productId}`);
  },
});
```

### SSG (Static Site Generation / Prerendering)

Routes render once at build time and are served as static HTML.

**Configuration:**

```ts
// vite.config.ts
analog({
  prerender: {
    routes: ['/', '/about', '/cart', '/shipping'],
    sitemap: { host: 'https://example.com' },
  },
  experimental: {
    typedRouter: true,
  },
});
```

**How typed routes interact:**

- Identical to SSR from the type-safety perspective — same generated types, same schemas
- `definePageLoad()` handlers execute once during prerender; output is baked into static HTML
- The `analogRouteTree` metadata can be used at build time to programmatically discover prerenderable routes:

```ts
import { analogRouteTree } from '../routeTree.gen';

// Discover all static routes for prerender config
const staticRoutes = Object.values(analogRouteTree.byId)
  .filter(
    (route) =>
      !route.isCatchAll && !route.isOptionalCatchAll && route.kind === 'page',
  )
  .map((route) => route.fullPath);
```

### Client-Only Rendering (`ssr: false`)

Individual routes can opt out of SSR while retaining full type safety.

**Configuration:**

```ts
// vite.config.ts
analog({
  nitro: {
    routeRules: {
      '/client': { ssr: false },
      '/dashboard/**': { ssr: false },
    },
  },
  experimental: {
    typedRouter: true,
  },
});
```

**How typed routes interact:**

- Type generation and route table augmentation still happen at build time — client-only routes are fully typed
- `definePageLoad()` handlers for client-only routes execute client-side, fetching data via the Nitro API layer

### Content Routes (Markdown)

Markdown files in `src/content/` are discovered and typed alongside page routes.

**How typed routes interact:**

- Content routes are marked `kind: 'content'` in the generated route tree

### Rendering Mode Summary

| Concern             | SSR                       | SSG / Prerender            | Client-Only (`ssr: false`)     |
| ------------------- | ------------------------- | -------------------------- | ------------------------------ |
| Type safety         | Full (build-time)         | Full (build-time)          | Full (build-time)              |
| `routeTree.gen.ts`  | Generated at build        | Generated at build         | Generated at build             |
| `definePageLoad()`  | Executes on server        | Executes once at build     | Executes client-side via fetch |
| Schema validation   | Server-side at request    | Server-side at build       | Client-side at runtime         |
| Route tree metadata | Available server + client | Available in static output | Available client-side          |

---

## Implementation Status

### Iteration Log

| #   | Date       | Focus                                                                                     | Status |
| --- | ---------- | ----------------------------------------------------------------------------------------- | ------ |
| 1   | 2026-03-15 | Core implementation: route-manifest, route-path, typed-router, Vite plugin, 67 tests      | Done   |
| 2   | 2026-03-15 | Schema-aware codegen, definePageLoad, detectSchemaExports, 84 tests total                 | Done   |
| 3   | 2026-03-15 | Input/Output type distinction, integration test, RouteParamsOutput/RouteQueryOutput       | Done   |
| 4   | 2026-03-15 | Type tests, dev diagnostics, formatManifestSummary, 112 tests total                       | Done   |
| 5   | 2026-03-15 | Platform plugin consolidation, codegen primitives                                         | Done   |
| 6   | 2026-03-15 | Route tree metadata: `filenameToRouteId`, `AnalogGeneratedRouteRecord`, `analogRouteTree` | Done   |

### Test Coverage

| Test file                                    | Tests   |
| -------------------------------------------- | ------- |
| `route-manifest.spec.ts`                     | 67      |
| `route-path.spec.ts`                         | 25      |
| `route-path.typetest.spec.ts`                | 17      |
| `route-generation.integration.spec.ts`       | 7       |
| `route-generation-plugin.spec.ts` (platform) | 4       |
| `typed-routes-plugin.spec.ts`                | 3       |
| **Typed routes total**                       | **116** |

All existing tests (define-action, define-api-route, parse-raw-content-file, validate, routes, render, meta-tags, etc.) pass with zero regressions. Full router test suite: **250 tests**, platform: **9 tests**, e2e (Playwright): **12 tests** — all green.

### Files Changed (vs `alpha`)

98 files changed, ~10,000 lines added across:

- `packages/platform/src/lib/` — Route generation plugin, codegen, and manifest primitives
- `packages/router/src/lib/` — Runtime APIs and types
- `packages/router/server/actions/` — `definePageLoad` and validation
- `apps/analog-app/src/routeTree.gen.ts` — Live generated output
- `apps/docs-app/docs/features/routing/typed-routes.md` — User-facing docs

### Key Design Decisions Made

1. **Module augmentation over separate imports** — Generated types augment `@analogjs/router`'s `AnalogRouteTable` interface so typed helpers work without explicit imports of generated code.

2. **Bracket syntax in route keys** — Route table keys use `[id]`, `[...slug]`, `[[...slug]]` syntax matching filenames instead of Angular's `:id` / `**` syntax, for clarity and stronger typing.

3. **`routePath()` returns a route object** — `routePath('/users/[id]', { params: { id: '42' } })` returns an object with the resolved `path` plus `routerLinkOptions` (`queryParams`, `fragment`, `queryParamsHandling`, etc.). The options arg is required when the route has params, optional for static routes like `routePath('/about')`.

4. **String fallback** — `AnalogRoutePath` falls back to `string` when no routes are generated, enabling gradual adoption.

5. **Codegen in platform** — All manifest and codegen primitives live in `@analogjs/platform`, keeping the router package focused on runtime.

6. **Single combined output file** — The platform plugin composes route table and route tree metadata into one `routeTree.gen.ts` with deduped imports.

7. **Plugin lives in `@analogjs/platform`** — Route generation is part of the platform package, wired via `experimental.typedRouter`. No separate plugin package.

---

## Forward Roadmap

### Completed: Route Tree Enrichment

The route tree pattern has been fully implemented and verified:

- [x] `AnalogGeneratedRouteRecord` with parent-child hierarchy, literal-typed generics
- [x] `AnalogFileRoutesById`, `AnalogFileRoutesByFullPath`, `AnalogFileRoutesByTo` typed interfaces
- [x] `AnalogRouteTreeId`, `AnalogRouteTreeFullPath`, `AnalogRouteTreeTo` union types
- [x] `analogRouteTree` runtime constant with `byId`, `byFullPath`, `byTo` lookups
- [x] App build, unit tests, and e2e tests all passing

### Remaining Work

- [ ] Watch-mode regeneration stress testing
- [ ] Breadcrumb/sidebar generation from route tree metadata
- [ ] Broader build validation across all workspace apps

### Future Milestones

**Devtools & diagnostics:**

- Route tree viewer
- Active route match / resolved params
- Schema validation failure inspection
- Generated artifact inspection

**Template integration:**

- Typed `RouterLink` directive (beyond pipe)
- Typed redirect helpers
- Typed `UrlTree` builders

---

## What We Are Not Doing

> These decisions are deliberate, not deferred.

- **Not building a new router.** Angular Router is the runtime.
- **Not making route names the primary API.** Paths come first.
- **Not requiring schemas for all routes.** Schemas are opt-in refinements.
- **Not defaulting to runtime validation on every navigation.** Compile-time carries the safety burden.
- **Not importing TanStack's hook-centric route module model.** Angular uses DI and signals.
- **Not building loaders or caching.** Data loading and cache semantics are separate concerns.
- **Not exposing Nitro page transport URLs** (`/_analog/pages/*`) in the public contract.
- **Not creating a separate typed-router package.** The runtime API lives in `@analogjs/router`.
- **Not including JSON-LD.** Structured data is out of scope for typed routes.

---

## Migration Story

> No breaking changes. Existing Analog apps continue to work unchanged.

| Step | Action                                                              |
| ---- | ------------------------------------------------------------------- |
| 1    | Enable `experimental.typedRouter: true`                             |
| 2    | Adopt `routePath()` or `injectNavigate()` / `injectNavigateByUrl()` |
| 3    | Optionally add `routeParamsSchema` / `routeQuerySchema` to routes   |
| 4    | Optionally reuse those schemas in actions, APIs, and loads          |

When no route table is generated, all path types fall back to `string` and params are untyped. Existing code continues to work without changes.

---

## Comparison with TanStack Router

| Concept            | TanStack Router                   | Analog                                                                              |
| ------------------ | --------------------------------- | ----------------------------------------------------------------------------------- |
| Type registration  | `Register` interface augmentation | `AnalogRouteTable` augmentation                                                     |
| Route codegen      | `routeTree.gen.ts`                | `src/routeTree.gen.ts`                                                              |
| Type-safe navigate | `<Link to="/path" params={...}>`  | `injectNavigate()` / `injectNavigateByUrl()`                                        |
| Typed params       | `useParams({ from: '/path' })`    | `injectParams('/path')`                                                             |
| Typed search       | `useSearch({ from: '/path' })`    | `injectQuery('/path')`                                                              |
| Root context       | `createRootRouteWithContext<T>()` | `withRouteContext(ctx)`                                                             |
| Strict mode        | `useParams({ strict: true })`     | Built into `injectParams()` type constraints                                        |
| Schema validation  | Validator adapters (Zod, Valibot) | [Standard Schema](https://github.com/standard-schema/standard-schema) (any library) |
| Route tree         | Runtime route instances           | Metadata-only `analogRouteTree` (no runtime registration)                           |
