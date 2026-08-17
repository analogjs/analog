# RFC: Analog on Angular's esbuild + Vite build infrastructure

**Status:** Prototype (claude/analog-routes-angular-esbuild branch)
**Author:** Brandon Roberts
**Date:** 2026-08-17
**Packages:** @analogjs/platform, @analogjs/router (`/ssr`), @analogjs/content

---

## Summary

A second build path for Analog that runs the full feature set on Angular's
own build infrastructure — the esbuild-based application builder for bundling
and Angular's Vite-based dev server for development — with `@angular/ssr` as
the render host instead of Nitro. Two builder wrappers are the entire
integration surface:

```jsonc
// angular.json / project.json
"build": { "builder": "@analogjs/platform:application", /* usual options */ },
"serve": { "builder": "@analogjs/platform:dev-server", /* usual options */ }
```

Everything outside an `analog` option section passes through to
`@angular/build` untouched. App config is identical to a Vite Analog app
(`provideFileRouter()`, `provideContent()`, no generated imports), the
server entry is Angular's Express scaffold plus one `app.use`, and every
per-page rendering decision lives in the page's own `routeMeta`. Feature
parity with the Vite + Nitro path is complete: 42 capabilities at parity,
0 gaps, 3 out of scope by maintainer decision (scaffolding, fine-grained
HMR, automatic `VITE_*` env loading).

## Motivation

Analog today owns a parallel build pipeline: a Vite configuration, a set of
Vite plugins, and Nitro for SSR/SSG and the server surface. That pipeline is
also Analog's largest maintenance surface — Vite majors, Rollup/Rolldown
churn, and Nitro internals all land on this repo first, and the Nitro-based
server integration is already in maintenance mode for v3. Meanwhile
Angular's CLI has converged on the same primitives underneath: esbuild
bundling, a Vite-based dev server, and `@angular/ssr`.

Running Analog's features on Angular's builder moves the burden where it
belongs:

1. **Maintenance shifts upstream.** Bundling, dev serving, optimization,
   i18n, service workers, and the SSR engine are Angular's supported stack,
   tested by the CLI team on every release.
2. **Adoption cost collapses.** A stock `ng new --ssr` app is two config
   edits away from file-based routing, and one schematic away from the full
   surface. No `vite.config.ts`, no Nitro concepts, no new server model.
3. **The replacement is complete, not partial.** Every Nitro-path
   capability — API routes, `.server.ts` page endpoints, server functions,
   middleware, content prerendering, sitemap, streaming — has an
   esbuild-path equivalent, so retiring the Nitro server strands no
   feature.

## Design

### Builders

`@analogjs/platform:application` and `:dev-server` wrap `buildApplication`
and `executeDevServerBuilder` from `@angular/build`, injecting Analog's
esbuild plugins through the supported `extensions.codePlugins` /
`buildPlugins` arguments. All other options pass through; Analog settings
live in one `analog` section (highlighter, content dirs, additional
pages/API dirs, streaming, sitemap, plugins). Both builders are registered
in a single package-root `executors.json` consumed by the Angular CLI and
Nx alike (architect rejects `..` implementation paths, so the manifest sits
at the package root where every path is `..`-free; the devkit builders must
not appear under the `executors` manifest key or Nx misloads them).

### Discovery: esbuild plugins and the boot module

Esbuild plugins discover the app's file conventions — pages, markdown
content, API routes in `src/server/routes`, `.server.ts` page endpoints,
server functions, global middleware — and bundle them into the build. A
discovery manifest makes adding or removing files rebuild in watch mode
(Angular's watcher honors neither plugin `watchDirs` nor directory
watches).

App code never imports anything generated. An injected boot module
registers the discovered maps with the packages via internal setters, and
`provideFileRouter` / `provideContent` fold them in at DI time — the exact
ergonomics of the Vite globs. Registration is per-graph module state,
deliberately not a global: Angular bundles `main.server` and the `ssr.entry`
as two separate esbuild graphs with their own copies of every package, and a
process-wide global would hand one graph's component defs to the other
graph's router (a cross-runtime NG0203, found the hard way).

Build-time-only page facts (`routeMeta.prerender: false`,
`routeMeta.streaming: true`) are read from the AST (oxc), literals only, and
published alongside the file maps.

### The server: one entry, one middleware

`@analogjs/router/ssr` is the whole server-side surface:

- `provideAnalogServerRendering(withConfig(…), withRoutes(…))` derives the
  `@angular/ssr` server-route configuration from the pages themselves:
  static paths prerender, `getPrerenderParams` (and the `fromContentDir`
  helper) expands dynamic paths, endpoint-backed and `prerender: false`
  pages render per request, and explicit `withRoutes` entries cover paths
  outside the file map. It also installs `provideServerRequestContext()`,
  bridging Analog's `REQUEST` / `RESPONSE` / `BASE_URL` / `LOCALE` tokens
  from Angular's own request tokens.
- `createAnalogRequestHandler({ config })` is a Connect-style middleware
  covering exactly Analog's surface — global middleware, server functions,
  page endpoints, API routes, streamed pages — and falling through via
  `next()` for everything else. Static files, `AngularNodeAppEngine`, and
  listening stay in the app's own `server.ts`, which is Angular's Express
  scaffold plus one `app.use`. Nitro semantics are preserved where handlers
  depend on them (`event.$fetch`, `originalUrl`, redirect timing, context
  bridging).

### Development

Dev flows through Angular's Vite-based dev server with the same plugins via
`buildPlugins`. With `outputMode` + `ssr.entry` configured, the dev server
forwards requests to the app's own `reqHandler` — the same handler chain in
dev and production. Without a server entry, dev middleware serves API routes
and page endpoints by bundling them on demand.

### Extensibility

`analog.plugins` is the escape hatch `vite.config.ts` provides on the Vite
path: workspace-root-relative module paths default-exporting an esbuild
`Plugin`, `Plugin[]`, or factory, loaded as ESM by both builders, appended
after Analog's plugins (so route and content discovery stay
authoritative), applied to both bundles. Esbuild plugins only; no
Vite-plugin compatibility shim.

### Migration and adoption

`ng g @analogjs/platform:migrate-angular-ssr` migrates a stock
`ng new --ssr` app: a plain `@angular-devkit/schematics` schematic (no Nx
devkit) that swaps the builders, rewrites `provideRouter` →
`provideFileRouter(withExtraRoutes(…))` and `provideServerRendering` →
`provideAnalogServerRendering` via oxc AST edits, mounts the Analog handler
ahead of `express.static`, extends the TypeScript program, and adds
dependencies. Files that diverge from the scaffold shape are reported as
manual steps, never guessed at; re-running is a no-op.

Adoption is a ladder with independent rungs, each verified:

1. **CSR file routing only** — builder swap + `provideFileRouter()`; no
   `@angular/ssr` anywhere (`h3`, `radix3`, `@angular/ssr` are optional
   peers).
2. **SSR under Angular's own wiring** — file routes covered by the
   scaffold's `**` server route; render modes hand-managed.
3. **The full surface** — page-derived server routes plus the request
   handler; what the schematic produces.

## Compatibility

- The Vite + Nitro path is untouched; this is an additive second path.
- New public API: the two builders, `@analogjs/router/ssr`, `fromContentDir`,
  `withContentFiles`, and the `analog` option section. Map-bridge features
  are `ɵ`-internal; the builders are the only supported way to run the
  plugins.
- Peer floor: declared `@angular/build >=18`, validated on v22. The floor
  should be decided (and CI-enforced) before this path is the default.
- All new code is ESM; plugin modules for `analog.plugins` load as ESM.

## Validation

`apps/esbuild-app` resolves the builders by name and drives the real
`buildApplication`. Continuously asserted:

- `nx verify esbuild-app` — 35/35 output checks (routing, content, SSR/SSG,
  endpoints, form actions, server functions incl. client-scrub, middleware,
  streaming, sitemap, debug routes, user plugins)
- `nx verify-browser` — 12/12 in real Chromium (hydration, forms, scrub)
- `nx verify-dev-server` — 7/7 (serve, rebuild-on-edit, add-a-page, server
  surface in dev)
- `nx verify-prod` — 35/35 + 12/12 under optimization and hashing
- `analog-app` (`build-ng` / `serve-ng` targets) as the dogfood app,
  including shared-lib pages and API routes
- CSR-only mode verified in Chromium against a static file server
- Package suites: router 17/17 files, content 7/7, platform 12/12

The full parity board (42 rows with per-row evidence) accompanies this RFC.

## Out of scope (maintainer decisions)

- **Scaffolding** (`create-analog`, app generators) — the three-file server
  surface is scaffold-shaped if this changes.
- **Fine-grained HMR** — rebuild + live reload (plus the CLI's own
  template/style HMR) is the dev loop; surgical invalidation stays a
  Vite-path behavior and is bounded by `@angular/build` regardless.
- **Automatic `VITE_*` env loading** — `import.meta.env` carries
  `PROD`/`DEV`/`SSR`; app-defined variables go through Angular's `define`
  or an `analog.plugins` plugin.

## Risks

1. **Couplings to Angular internals.** The `@defer` streaming patch
   (experimental, string patch, degrades to buffered with a warning), the
   two-graph boot registration, and the discovery-manifest watch workaround
   all depend on `@angular/build` behavior that could shift between minors.
   Mitigation: the verify matrix runs the real builder; an upstream
   per-`@defer`-block resolution hook would delete the streaming patch on
   both paths.
2. **Shared server-fn primitives.** Three symbols (`deriveServerFnId`,
   `serverFnFileId`, `injectServerFnIds`) currently live in
   `@analogjs/vite-plugin-nitro` subpaths, shared by both paths as the
   single source of truth for server-function ids. As the Nitro path
   winds down they move into `@analogjs/platform`, and `deriveServerFnId`
   must stay byte-compatible across the move while any Nitro-path app
   pairs platform's client scrub with nitro's dispatch — diverging ids
   break dispatch silently.
3. **Single-environment validation.** One fixture plus the dogfood app, on
   macOS. Windows path handling and real-world app diversity (monorepos,
   i18n builds, service workers) are unproven. Mitigation: CI legs and a
   pre-release cycle with external apps.
4. **Deployment targets.** The path emits a Node server (runs as-is on Bun
   and Deno; deploys fully static when everything prerenders). Nitro's
   preset matrix is not replicated; edge isolates would need a
   `fetch`-style handler built on `AngularAppEngine` (assessed, not built).

## Integration into v3

The prototype targets the current release line and integrates against
v3's restructuring, verified by a test merge (97 files change, 19
conflict, and the entire esbuild path merges clean — every conflict is an
integration seam, not new code). Three structural items:

1. **Router content-split (#2216)** — the boot-map fold transplants into
   the restructured `provide-file-router-base` / `routes.ts` and the
   `/content` entry.
2. **Rolldown packaging (#2120)** — the `router/ssr` entry joins the
   `vite.config.lib.ts` entry map with `dist/fesm2022` exports, and
   platform's esbuild assets (manifest, schemas, schematics, env types)
   re-plumb into the Vite lib build.
3. **oxlint (#2114)** — lint conformance for the new files.

vite-plugin-nitro's `server-fn-id` export still ships, so the
shared-primitive move is planned work, not a blocker. Estimated at a
focused day or two; the router-split seam drifts as v3 moves, so
integrating early keeps it cheap.

## Rollout

1. **v3 pre-releases:** ship as experimental. README-level docs, streaming
   behind its flag, the Vite path remains the default and the documented
   path.
2. **Gate to default:** v3 integration done; verify suites (including a
   Windows leg) wired into CI; Angular peer floor decided and enforced; a
   pre-release cycle of external apps; a stated deployment-targets
   position in the docs.
3. **After default:** the Vite path remains supported for existing apps;
   new-app guidance points here.

## Alternatives considered

- **Keep Nitro and chase Vite majors** (#2035 direction): retains the
  preset matrix but keeps Analog's largest maintenance surface alive and
  depends on Nitro's own Vite/Rolldown timeline — the cost this RFC exists
  to remove.
- **Custom Vite SSR dev server without Nitro:** still owns a pipeline;
  solves dev but not the production server or the maintenance transfer.
- **Do nothing:** the Nitro server integration is already in maintenance
  mode, so standing still leaves its whole feature surface without a
  successor.

## Open questions

1. Declarative route rules (headers/caching per route pattern) — covered
   imperatively by global middleware today; is a declarative layer worth
   its own surface?
2. Edge `fetch` handler — worth building pre-default, or demand-driven?
3. Angular peer floor — `>=18` as declared, or v20+/v22+ to match what the
   verify matrix actually exercises?
