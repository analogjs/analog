# RFC: Analog on Angular's esbuild + Vite build infrastructure

**Status:** Proposal (working prototype available)
**Author:** Brandon Roberts
**Date:** 2026-08-17
**Packages:** @analogjs/platform, @analogjs/router (`/ssr`), @analogjs/content

---

## Summary

This RFC proposes that Analog officially support running its full feature
set on Angular's own build infrastructure — the esbuild-based application
builder for bundling, Angular's Vite-based dev server for development, and
`@angular/ssr` as the render host — as a supported path alongside the
existing Vite integration, with the intent that it becomes the recommended
path for new applications once the rollout gates below are met.

The proposed integration surface is deliberately small: two builder
wrappers, one server entry point, and one schematic.

```jsonc
// angular.json / project.json
"build": { "builder": "@analogjs/platform:application", /* usual options */ },
"serve": { "builder": "@analogjs/platform:dev-server", /* usual options */ }
```

A working prototype implements the whole proposal and backs every claim in
this document; see **Prototype and validation**.

## Motivation

Analog today owns a parallel build pipeline: a Vite configuration, a set of
Vite plugins, and Nitro for SSR/SSG and the server surface. That pipeline is
also Analog's largest maintenance surface — Vite majors, Rollup/Rolldown
churn, and Nitro internals all land on this repo first, and the Nitro-based
server integration is already in maintenance mode. Meanwhile Angular's CLI
has converged on the same primitives underneath: esbuild bundling, a
Vite-based dev server, and `@angular/ssr`.

Adopting Angular's builder as a first-class Analog target would:

1. **Shift maintenance upstream.** Bundling, dev serving, optimization,
   i18n, service workers, and the SSR engine become Angular's supported
   stack, tested by the CLI team on every release.
2. **Collapse adoption cost.** A stock `ng new --ssr` app is two config
   edits away from file-based routing, and one schematic away from the full
   surface. No `vite.config.ts`, no Nitro concepts, no new server model.
3. **Give the Nitro feature surface a successor.** Every Nitro-path
   capability — API routes, `.server.ts` page endpoints, server functions,
   middleware, content prerendering, sitemap, streaming — has an equivalent
   on this path, so retiring the Nitro server strands no feature.

## Proposal

Analog would ship and support:

1. **Two builders** — `@analogjs/platform:application` and `:dev-server`,
   wrapping `buildApplication` / `executeDevServerBuilder` from
   `@angular/build`. All options pass through untouched except one `analog`
   section (content pipeline settings, additional pages/content/API
   directories, streaming, sitemap, app-supplied plugins).
2. **One server entry** — `@analogjs/router/ssr`, carrying the server-side
   API surface: `provideAnalogServerRendering(...features)` and a
   Connect-style `createAnalogRequestHandler({ config })`.
3. **A migration schematic** —
   `ng g @analogjs/platform:migrate-angular-ssr`, a plain Angular schematic
   (no Nx devkit) migrating a stock `ng new --ssr` application.
4. **An extension point** — `analog.plugins`, app-supplied esbuild plugins
   by module path, filling the role `vite.config.ts` plays on the Vite
   path.

The Vite + Nitro path is untouched by this proposal; nothing here is a
breaking change. Existing apps migrate on their own schedule or not at all.

### Guiding constraints

These are proposed as requirements on the design, not incidental
properties:

- **App config stays identical to a Vite Analog app.** `provideFileRouter()`
  and `provideContent()` with no generated imports anywhere in app code.
- **The server entry stays Angular's scaffold.** The developer owns static
  files, `AngularNodeAppEngine`, and listening; Analog is one `app.use`
  that handles only Analog's surface and falls through for everything else.
- **Every per-page rendering decision lives in the page's `routeMeta`.** No
  server-config side channels (path lists, prerender blocks, streaming
  lists); build-time flags are read from the AST, literals only.
- **Everything outside the `analog` option section belongs to Angular.**
  The builders never reinterpret or shadow `@angular/build` options.

## Design

### Builders

The builders inject Analog's esbuild plugins through the supported
`extensions.codePlugins` / `buildPlugins` arguments of `@angular/build`.
Both are registered in a single package-root manifest consumed by the
Angular CLI and Nx alike.

### Discovery

Esbuild plugins discover the app's file conventions — pages, markdown
content, API routes in `src/server/routes`, `.server.ts` page endpoints,
server functions, global middleware — and bundle them into the build. A
discovery manifest makes adding or removing files rebuild in watch mode
(Angular's watcher honors neither plugin `watchDirs` nor directory
watches).

App code never imports anything generated: an injected boot module
registers the discovered maps with the packages, and `provideFileRouter` /
`provideContent` fold them in at DI time — the exact ergonomics of the Vite
globs. Registration is per-bundle-graph, deliberately not global: Angular
bundles the server bootstrap and the server entry as separate esbuild
graphs with their own copies of every package, and a process-wide global
would hand one graph's component defs to the other graph's router.

### The server

- `provideAnalogServerRendering(withConfig(…), withRoutes(…))` derives the
  `@angular/ssr` server-route configuration from the pages themselves:
  static paths prerender, `getPrerenderParams` (with a `fromContentDir`
  helper) expands dynamic paths, endpoint-backed and `prerender: false`
  pages render per request, and explicit `withRoutes` entries cover paths
  outside the file map. It also bridges Analog's `REQUEST` / `RESPONSE` /
  `BASE_URL` / `LOCALE` tokens from Angular's own request tokens.
- `createAnalogRequestHandler({ config })` covers exactly Analog's
  surface — global middleware, server functions, page endpoints, API
  routes, streamed pages — and falls through via `next()` for everything
  else. Nitro semantics are preserved where handlers depend on them
  (`event.$fetch`, `originalUrl`, redirect timing, context bridging).

### Development

Dev flows through Angular's Vite-based dev server with the same plugins.
With `outputMode` + `ssr.entry` configured, requests are forwarded to the
app's own `reqHandler` — the same handler chain in dev and production.
Without a server entry, dev middleware serves API routes and page
endpoints by bundling them on demand.

### Adoption

Adoption is proposed as a ladder with independent rungs:

1. **CSR file routing only** — builder swap + `provideFileRouter()`; no
   `@angular/ssr` anywhere (`h3`, `radix3`, `@angular/ssr` are optional
   peers).
2. **SSR under Angular's own wiring** — file routes covered by the
   scaffold's `**` server route; render modes hand-managed.
3. **The full surface** — page-derived server routes plus the request
   handler; what the migration schematic produces.

## Proposed scope exclusions

- **Scaffolding** (`create-analog`, app generators) — deferred; the
  three-file server surface is scaffold-shaped if this changes.
- **Fine-grained HMR** — rebuild + live reload (plus the CLI's own
  template/style HMR) is the dev loop; surgical invalidation stays a
  Vite-path behavior and is bounded by `@angular/build` regardless.
- **Automatic `VITE_*` env loading** — `import.meta.env` carries
  `PROD`/`DEV`/`SSR`; app-defined variables go through Angular's `define`
  or an `analog.plugins` plugin.
- **Nitro's deployment preset matrix** — the path emits a Node server
  (runs as-is on Bun and Deno; deploys fully static when everything
  prerenders). Edge isolates would need a `fetch`-style handler built on
  `AngularAppEngine`; whether to build one is an open question below.

## Prototype and validation

A working prototype implements the full proposal. Feature parity with the
Vite + Nitro path stands at 42 capabilities with no gaps (a per-row parity
board with evidence accompanies this RFC). It is continuously asserted by
a fixture app driving the real `buildApplication`:

- 35/35 output checks (routing, content, SSR/SSG, endpoints, form actions,
  server functions incl. client-scrub, middleware, streaming, sitemap,
  debug routes, user plugins)
- 12/12 checks in real Chromium (hydration, forms, scrub)
- 7/7 dev-server checks (serve, rebuild-on-edit, add-a-page, server
  surface in dev)
- The output and browser suites repeated under the production
  configuration (optimization + hashing)
- The repo's own `analog-app` building and serving on the builders,
  including shared-lib pages and API routes
- CSR-only mode verified in Chromium against a static file server
- The migration schematic verified end-to-end against a scaffold fixture,
  with an idempotency rerun and a CSR bail-out

A test merge against the current codebase confirms integration shape: the
prototype merges clean except at known seams (the router content-split,
the Rolldown packaging migration, oxlint conformance), estimated at a
focused day or two of reconciliation.

## Risks

1. **Couplings to Angular internals.** The `@defer` streaming patch
   (experimental, degrades to buffered with a warning), the per-graph boot
   registration, and the discovery-manifest watch workaround depend on
   `@angular/build` behavior that could shift between minors. Mitigation:
   the verify matrix runs the real builder; an upstream
   per-`@defer`-block resolution hook would delete the streaming patch on
   both paths.
2. **Shared server-fn primitives.** Three symbols (`deriveServerFnId`,
   `serverFnFileId`, `injectServerFnIds`) currently live in
   `@analogjs/vite-plugin-nitro` subpaths as the single source of truth
   for server-function ids. As the Nitro path winds down they move into
   `@analogjs/platform`, and `deriveServerFnId` must stay byte-compatible
   across the move while any Nitro-path app pairs platform's client scrub
   with nitro's dispatch — diverging ids break dispatch silently.
3. **Single-environment validation.** One fixture plus the dogfood app, on
   macOS. Windows path handling and real-world app diversity (monorepos,
   i18n builds, service workers) are unproven. Mitigation: CI legs and a
   pre-release cycle with external apps.

## Rollout

1. **Pre-releases:** ship as experimental. README-level docs, streaming
   behind its flag, the Vite path remains the default and the documented
   path.
2. **Gate to recommended:** codebase integration done; verify suites
   (including a Windows leg) wired into CI; Angular peer floor decided and
   enforced (declared `>=18` today, validated on v22); a pre-release cycle
   of external apps; a stated deployment-targets position in the docs.
3. **After the gate:** the Vite path remains supported for existing apps;
   new-app guidance points here.

## Feedback requested

1. **Should this become the recommended path for new apps** once the gates
   are met, or remain a permanent alternative?
2. **Declarative route rules** (headers/caching per route pattern) —
   covered imperatively by global middleware today; is a declarative layer
   worth its own surface?
3. **Edge `fetch` handler** — worth building before the path is
   recommended, or demand-driven?
4. **Angular peer floor** — `>=18` as declared, or v20+/v22+ to match what
   the validation matrix actually exercises?
