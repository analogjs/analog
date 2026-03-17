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

- **`useParams({ from })` and `useSearch({ from })`** — The `from` parameter pattern for constraining return types by route path inspired `injectTypedParams('/path')` and `injectTypedQuery('/path')`.

- **Root route context** — `createRootRouteWithContext<T>()` inspired `withRouteContext()` and `injectRouteContext()`, adapted to Angular's DI model.

- **Loader caching semantics** — `defaultStaleTime`, `defaultGcTime`, and `defaultPendingMs` from `createRouter()` options inspired `withLoaderCaching()`.

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

- **Broad propagation of typed routing** — Nuxt proved that generated types should flow into all major route entrypoints, not just a single helper. Analog propagates types through `routePath()`, `injectTypedRouter()`, `injectTypedParams()`, `injectTypedQuery()`, `RouteLinkPipe`, and `definePageLoad()`.

Key references studied:

- `zFrameworks/nuxt-main/docs/3.guide/6.going-further/1.experimental-features.md`
- `zFrameworks/nuxt-main/test/typed-router.test.ts`

### Astro

> _"Less useful as a public typed-routing model, but valuable as an internal engine reference."_

[Astro](https://astro.build/) (`zFrameworks/astro-main/`) contributed:

- **Manifest discipline** — Astro's careful route-manifest generation, route collision handling, and watch/rebuild robustness influenced the design of `generateRouteManifest()` with collision warnings and deterministic sorting.

- **Internal diagnostics** — Astro's approach to build-time diagnostics inspired `formatManifestSummary()` and the schema-mismatch warnings.

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
│  @analogjs/platform              │  Orchestration: wires up route generation
│  route-generation-plugin.ts      │  via experimental.typedRouter flag
└──────────┬───────────────────────┘
           │ delegates to
           ▼
┌──────────────────────────────────┐
│  @analogjs/vite-plugin-routes    │  Dedicated Vite plugin for codegen
│  typed-routes-plugin.ts          │  Generates src/routeTree.gen.ts
│  json-ld-manifest-plugin.ts      │  JSON-LD manifest colocation
└──────────┬───────────────────────┘
           │ imports from
           ▼
┌──────────────────────────────────┐
│  @analogjs/router/manifest       │  Shared manifest engine (no Angular deps)
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
│  routePath()                     │  Type-safe URL builder
│  injectTypedRouter()             │  Angular DI typed router wrapper
│  injectTypedParams()             │  Typed params signal
│  injectTypedQuery()              │  Typed query signal
│  RouteLinkPipe                   │  Template pipe for typed links
│  withTypedRouter()               │  Router feature provider
│  withRouteContext()              │  Root context provider
│  withLoaderCaching()             │  Loader cache configuration
│  injectRouteContext()            │  Context consumer
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

The Vite plugin generates a single canonical file at `src/routeTree.gen.ts` containing up to three composed layers:

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
  hasJsonLd: boolean;
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

**Layer 3 — Typed JSON-LD Manifest** (opt-out via `jsonLdManifest: false`)

```ts
import type { Graph, Thing, WithContext } from 'schema-dts';

export type AnalogJsonLdDocument = WithContext<Thing> | Graph | Array<WithContext<Thing>>;
export type GeneratedJsonLdManifestEntry = {
  routePath: string;
  sourceFile: string;
  kind: 'module' | 'content';
  resolveJsonLd: () => AnalogJsonLdDocument[];
};

export const routeJsonLdManifest = new Map<string, GeneratedJsonLdManifestEntry>([
  ['/', { routePath: '/', sourceFile: '...', kind: 'module', resolveJsonLd: () => ... }],
]);
```

The manifest uses [`schema-dts`](https://github.com/google/schema-dts) types instead of generic `Record<string, unknown>`, providing typed `WithContext<Thing>` and `Graph` contracts for route-authored structured data.

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

| Export                        | Kind      | Purpose                                      |
| ----------------------------- | --------- | -------------------------------------------- |
| `routePath(path, options?)`   | function  | Type-safe URL builder                        |
| `injectTypedRouter()`         | function  | Angular DI typed router wrapper              |
| `injectTypedParams(from)`     | function  | Typed params signal (experimental)           |
| `injectTypedQuery(from)`      | function  | Typed query signal (experimental)            |
| `injectRouteContext()`        | function  | Access root route context (experimental)     |
| `RouteLinkPipe`               | pipe      | Template-friendly typed route URL building   |
| `withTypedRouter(options?)`   | feature   | Enable typed router in `provideFileRouter()` |
| `withRouteContext(ctx)`       | feature   | Provide root context (experimental)          |
| `withLoaderCaching(options?)` | feature   | Loader caching config (experimental)         |
| `RouteParamsOutput<P>`        | type      | Validated params type for a route            |
| `RouteQueryOutput<P>`         | type      | Validated query type for a route             |
| `AnalogRouteTable`            | interface | Augmented by generated code                  |
| `AnalogRoutePath`             | type      | Union of valid route paths                   |
| `AnalogJsonLdDocument`        | type      | Typed JSON-LD document (`schema-dts`)        |

### `@analogjs/router/server/actions` — Server

| Export                    | Kind     | Purpose                                |
| ------------------------- | -------- | -------------------------------------- |
| `definePageLoad(options)` | function | Typed page load with schema validation |
| `defineAction(options)`   | function | Server action with validation          |
| `defineApiRoute(options)` | function | API route with validation              |

### `@analogjs/router/manifest` — Build Tools

| Export                                             | Kind     | Purpose                           |
| -------------------------------------------------- | -------- | --------------------------------- |
| `filenameToRoutePath(filename)`                    | function | Convert filename to route path    |
| `filenameToRouteId(filename)`                      | function | Convert filename to structural id |
| `extractRouteParams(path)`                         | function | Extract param metadata from path  |
| `generateRouteManifest(files, detector?)`          | function | Build manifest from files         |
| `generateRouteTableDeclaration(manifest)`          | function | Generate TS route table           |
| `generateRouteTreeDeclaration(manifest, options?)` | function | Generate TS route tree module     |
| `detectSchemaExports(content)`                     | function | Detect schema exports in file     |
| `formatManifestSummary(manifest)`                  | function | Human-readable build summary      |

### `@analogjs/vite-plugin-routes` — Vite Plugin

| Export                     | Kind     | Purpose                                 |
| -------------------------- | -------- | --------------------------------------- |
| `typedRoutes(options?)`    | function | Vite plugin for `src/routeTree.gen.ts`  |
| `jsonLdManifest(options?)` | function | Standalone JSON-LD manifest Vite plugin |

### `@analogjs/platform` — Orchestration

| Export                            | Kind     | Purpose                                              |
| --------------------------------- | -------- | ---------------------------------------------------- |
| `routeGenerationPlugin(options?)` | function | Wires `typedRoutes()` via `experimental.typedRouter` |

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
   ├── routePath('/users/[id]', { params: { id: '42' } })     ✅ typed
   ├── router.navigate('/users/[id]', { params: { id: 42 } }) ❌ type error
   ├── injectTypedParams('/users/[id]')  → Signal<{ id: string }>
   └── '/users/[id]' | routeLink:{ params: { id: userId } }   ✅ typed
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
import { provideFileRouter, withTypedRouter } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter(withTypedRouter())],
};
```

### Direct Plugin Composition

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import { typedRoutes } from '@analogjs/vite-plugin-routes';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [typedRoutes(), analog()],
}));
```

### Configuration Options

| Option                  | Default                  | Description                            |
| ----------------------- | ------------------------ | -------------------------------------- |
| `outFile`               | `'src/routeTree.gen.ts'` | Output path for generated declarations |
| `jsonLdManifest`        | `true`                   | Include JSON-LD manifest in output     |
| `additionalPagesDirs`   | `[]`                     | Extra page directories to scan         |
| `additionalContentDirs` | `[]`                     | Extra content directories to scan      |
| `workspaceRoot`         | `process.cwd()`          | Workspace root for path resolution     |

---

## Rendering Modes

Typed routes and JSON-LD work across all Analog rendering modes. The route type generation is rendering-mode agnostic — all routes are typed regardless of how they render.

### SSR (Server-Side Rendering)

The default mode. Routes render on the server at request time.

**How typed routes interact:**

- `routeTree.gen.ts` is generated at build time; types are available during compilation regardless of SSR
- `definePageLoad()` handlers execute on the server with access to `fetch`, `event`, `request`, and `response`
- Schema-validated params (`routeParamsSchema`) are coerced on the server before reaching `handler`
- JSON-LD from `routeMeta.jsonLd` is serialized into `<script type="application/ld+json">` tags in the SSR HTML output with XSS-safe escaping

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

**JSON-LD in SSR:**

- Route metadata including `jsonLd` is resolved during Angular's server render
- `serializeJsonLd()` escapes `<`, `>`, `&`, and Unicode line separators to prevent XSS
- Script tags include `data-analog-json-ld` markers for client-side hydration replacement
- Hierarchical: parent + child route JSON-LD are collected and serialized

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
- JSON-LD is serialized into the prerendered HTML files (e.g., `dist/.../index.html`)
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
- JSON-LD for client-only routes is **not** in the initial HTML; it is injected dynamically after Angular bootstraps via `updateJsonLdOnRouteChange()`
- SEO-visible structured data requires SSR or prerendering — client-only JSON-LD is only visible to JavaScript-capable crawlers

```ts
// src/app/pages/client/(client).page.ts
import type { RouteMeta } from '@analogjs/router';
import type { WebPage, WithContext } from 'schema-dts';

export const routeMeta: RouteMeta = {
  title: 'Client Dashboard',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Dashboard',
  } satisfies WithContext<WebPage>,
};
```

### Content Routes (Markdown)

Markdown files in `src/content/` are discovered and typed alongside page routes.

**How typed routes interact:**

- Content routes are marked `kind: 'content'` in the generated route tree
- JSON-LD can be authored in YAML frontmatter:

```markdown
---
title: Getting Started
jsonLd:
  '@context': https://schema.org
  '@type': Article
  headline: Getting Started with Analog
---

# Getting Started
```

- Content route JSON-LD is inlined directly in the generated manifest (no module import needed)
- Frontmatter JSON-LD is extracted at build time by `extractMarkdownJsonLd()` and serialized into the manifest as static data

### Rendering Mode Summary

| Concern                | SSR                       | SSG / Prerender            | Client-Only (`ssr: false`)     |
| ---------------------- | ------------------------- | -------------------------- | ------------------------------ |
| Type safety            | Full (build-time)         | Full (build-time)          | Full (build-time)              |
| `routeTree.gen.ts`     | Generated at build        | Generated at build         | Generated at build             |
| `definePageLoad()`     | Executes on server        | Executes once at build     | Executes client-side via fetch |
| Schema validation      | Server-side at request    | Server-side at build       | Client-side at runtime         |
| JSON-LD in HTML        | Yes (SSR output)          | Yes (static HTML)          | No (injected client-side)      |
| JSON-LD SEO visibility | Guaranteed                | Guaranteed                 | JS-dependent crawlers only     |
| Route tree metadata    | Available server + client | Available in static output | Available client-side          |
| `hasJsonLd` flag       | Accurate                  | Accurate                   | Accurate                       |

---

## Implementation Status

### Iteration Log

| #   | Date       | Focus                                                                                      | Status |
| --- | ---------- | ------------------------------------------------------------------------------------------ | ------ |
| 1   | 2026-03-15 | Core implementation: route-manifest, route-path, typed-router, Vite plugin, 67 tests       | Done   |
| 2   | 2026-03-15 | Schema-aware codegen, definePageLoad, detectSchemaExports, 84 tests total                  | Done   |
| 3   | 2026-03-15 | Input/Output type distinction, integration test, RouteParamsOutput/RouteQueryOutput        | Done   |
| 4   | 2026-03-15 | Type tests, RouteLinkPipe, dev diagnostics, formatManifestSummary, 112 tests total         | Done   |
| 5   | 2026-03-15 | Package split: `@analogjs/router/manifest` + `@analogjs/vite-plugin-routes`, JSON-LD       | Done   |
| 6   | 2026-03-15 | Route tree metadata: `filenameToRouteId`, `AnalogGeneratedRouteRecord`, `analogRouteTree`  | Done   |
| 7   | 2026-03-15 | `schema-dts` integration: `AnalogJsonLdDocument`, typed manifest, route authoring surfaces | Done   |

### Test Coverage

| Test file                                    | Tests   |
| -------------------------------------------- | ------- |
| `route-manifest.spec.ts`                     | 67      |
| `route-path.spec.ts`                         | 25      |
| `route-path.typetest.spec.ts`                | 17      |
| `route-generation.integration.spec.ts`       | 7       |
| `json-ld.spec.ts`                            | 4       |
| `json-ld-manifest-plugin.spec.ts`            | 4       |
| `route-generation-plugin.spec.ts` (platform) | 4       |
| `typed-routes-plugin.spec.ts`                | 3       |
| **Typed routes total**                       | **131** |

All existing tests (define-action, define-api-route, parse-raw-content-file, validate, routes, render, meta-tags, etc.) pass with zero regressions. Full router test suite: **250 tests**, vite-plugin-routes: **7 tests**, platform: **9 tests**, e2e (Playwright): **12 tests** — all green.

### Files Changed (vs `alpha`)

98 files changed, ~10,000 lines added across:

- `packages/router/manifest/` — New secondary entry point for shared manifest engine
- `packages/router/src/lib/` — Runtime APIs and types
- `packages/vite-plugin-routes/` — New dedicated Vite plugin package
- `packages/platform/src/lib/` — Route generation orchestration
- `packages/router/server/actions/` — `definePageLoad` and validation
- `apps/analog-app/src/routeTree.gen.ts` — Live generated output
- `apps/docs-app/docs/features/routing/typed-routes.md` — User-facing docs

### Key Design Decisions Made

1. **Module augmentation over separate imports** — Generated types augment `@analogjs/router`'s `AnalogRouteTable` interface so typed helpers work without explicit imports of generated code.

2. **Bracket syntax in route keys** — Route table keys use `[id]`, `[...slug]`, `[[...slug]]` syntax matching filenames instead of Angular's `:id` / `**` syntax, for clarity and stronger typing.

3. **Rest args for conditional required params** — `routePath('/users/[id]', { params: { id: '42' } })` requires the options arg, while `routePath('/about')` makes it optional.

4. **String fallback** — `AnalogRoutePath` falls back to `string` when no routes are generated, enabling gradual adoption.

5. **Shared manifest engine** — `@analogjs/router/manifest` is a dependency-free secondary entry point consumed by both runtime and build packages.

6. **Single combined output file** — The Vite plugin composes route table, route tree metadata, and JSON-LD manifest into one `routeTree.gen.ts` with deduped imports.

7. **`@analogjs/vite-plugin-routes` as a dedicated package** — Route generation is a real Vite plugin package, wired into `@analogjs/platform` via `experimental.typedRouter` but usable standalone.

---

## Forward Roadmap

### Completed: Route Tree Enrichment & `schema-dts`

The route tree pattern has been fully implemented and verified:

- [x] `AnalogGeneratedRouteRecord` with parent-child hierarchy, literal-typed generics
- [x] `AnalogFileRoutesById`, `AnalogFileRoutesByFullPath`, `AnalogFileRoutesByTo` typed interfaces
- [x] `AnalogRouteTreeId`, `AnalogRouteTreeFullPath`, `AnalogRouteTreeTo` union types
- [x] `analogRouteTree` runtime constant with `byId`, `byFullPath`, `byTo` lookups
- [x] `hasJsonLd` awareness in route tree metadata
- [x] `schema-dts` integration: `AnalogJsonLdDocument` type alias (`WithContext<Thing> | Graph | Array<WithContext<Thing>>`)
- [x] Generated manifest uses typed `AnalogJsonLdDocument[]` instead of `Record<string, unknown>`
- [x] Route authoring surfaces (`RouteMeta.jsonLd`, `RouteExport.routeJsonLd`, `defineRouteMeta`) accept `AnalogJsonLdDocument`
- [x] `schema-dts` as optional peer dependency of `@analogjs/router`, dependency of `@analogjs/vite-plugin-routes`
- [x] App build, unit tests, and e2e tests all passing

### Remaining Work

- [ ] Watch-mode regeneration stress testing
- [ ] Breadcrumb/sidebar generation from route tree metadata
- [ ] Broader build validation across all workspace apps

### Future Milestones

**Typed page contracts:**

- Typed page-load contracts (`definePageLoad` with full schema integration)
- Loader dependency model (Angular-native `loaderDeps` inspired by TanStack)

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
- **Not exposing Nitro page transport URLs** (`/_analog/pages/*`) in the public contract.
- **Not creating a separate typed-router package.** The runtime API lives in `@analogjs/router`.

---

## Migration Story

> No breaking changes. Existing Analog apps continue to work unchanged.

| Step | Action                                                            |
| ---- | ----------------------------------------------------------------- |
| 1    | Enable `experimental.typedRouter: true`                           |
| 2    | Adopt `routePath()` or `injectTypedRouter()`                      |
| 3    | Optionally add `routeParamsSchema` / `routeQuerySchema` to routes |
| 4    | Optionally reuse those schemas in actions, APIs, and loads        |

When no route table is generated, all path types fall back to `string` and params are untyped. Existing code continues to work without changes.

---

## Comparison with TanStack Router

| Concept            | TanStack Router                      | Analog                                                                              |
| ------------------ | ------------------------------------ | ----------------------------------------------------------------------------------- |
| Type registration  | `Register` interface augmentation    | `AnalogRouteTable` augmentation                                                     |
| Route codegen      | `routeTree.gen.ts`                   | `src/routeTree.gen.ts`                                                              |
| Type-safe navigate | `<Link to="/path" params={...}>`     | `router.navigate('/path', { params })`                                              |
| Typed params       | `useParams({ from: '/path' })`       | `injectTypedParams('/path')`                                                        |
| Typed search       | `useSearch({ from: '/path' })`       | `injectTypedQuery('/path')`                                                         |
| Root context       | `createRootRouteWithContext<T>()`    | `withRouteContext(ctx)`                                                             |
| Loader caching     | `defaultStaleTime` / `defaultGcTime` | `withLoaderCaching(options)`                                                        |
| Strict mode        | `useParams({ strict: true })`        | `withTypedRouter({ strictRouteParams: true })`                                      |
| Schema validation  | Validator adapters (Zod, Valibot)    | [Standard Schema](https://github.com/standard-schema/standard-schema) (any library) |
| Route tree         | Runtime route instances              | Metadata-only `analogRouteTree` (no runtime registration)                           |
