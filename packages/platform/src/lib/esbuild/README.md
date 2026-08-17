# Analog file-based routes on the Angular application builder (sketch)

Status: **proof-of-concept sketch.** The builders are registered in a
package-root `builders.json` (see Verification for why) and validated
against a real Angular v22 build by `apps/esbuild-app`, which resolves
them by name (`nx build esbuild-app` / `nx serve esbuild-app`, with
`nx verify esbuild-app` asserting the output). Covers file-based
routing, markdown content routes, and SSR/SSG through `@angular/ssr`.
API routes from `src/server/routes` are served without Nitro (see API
routes below). The remaining Nitro server features — `.server.ts` page
endpoints, form actions, server functions, and streaming SSR — are not
ported yet; streaming stays out of scope until Angular exposes a
streaming render.

Validated end-to-end with `apps/esbuild-app`:

- Pages compile under AOT through the tsconfig `include`, and each
  page, the markdown route, and `@analogjs/content` land as separate
  lazy chunks. The Angular linker processes the Analog FESMs normally —
  the plugins do not interfere with the CLI's JS transform pipeline.
- `nx build --watch` and `nx serve` rebuild on file edits, and adding
  or removing a page rebuilds within a few seconds and updates the
  route map — driven by a discovery manifest (see Design), since the
  Angular builder's watcher sees neither plugin `watchDirs` nor
  directories in general (a directory listed as a watch file fires once
  and goes dead).
- `nx serve` serves the app with both plugins active, with rebuilds
  reaching the served bundles and live reload on. Watching and
  `liveReload` are defaulted by the builder wrapper: Angular's dev
  server takes those defaults from its JSON schema, which the
  pass-through schema does not provide — without them the inner build
  ran unwatched and rebuilds never propagated.

## Design

Instead of patching `@analogjs/router`'s published FESM (which would
race the Angular CLI's own JS transform pipeline and bypass the Angular
linker), route files are surfaced through a virtual module:

1. `analogRouterPlugin` (esbuild) resolves `analog:route-files` to a
   generated module mapping route file keys to `() => import(...)`
   entries. esbuild code-splits each page into a lazy chunk. The module
   also imports a discovery manifest — a JSON file listing the
   discovered route files, kept fresh by a recursive `fs.watch` on the
   route/content directories — which makes discovery a watchable build
   input: the Angular builder's watcher tracks only plain input files
   (plugin `watchDirs`/`watchFiles` never reach it, and a directory
   listed as a watch file fires once and goes dead), so a changed
   manifest is what makes adding or removing a page rebuild in watch
   mode and the dev server. The watchers are unref'd so one-shot builds
   still exit.
2. The injected boot module registers the map with `@analogjs/router`
   (internal setter), and `provideFileRouter` folds it into the route
   table through a `ROUTES` multi-provider factory when the Vite glob is
   empty — so all `provideFileRouter` features (meta tags, cookie
   interceptor, API prefix) keep working with no analog:\* imports in
   app code. `ɵwithRouteFiles` remains as an internal override seam.
3. Builder wrappers pass the plugins to `@angular/build` (v18+) through
   the public extension points: `buildApplication(options, context,
{ codePlugins })` and `executeDevServerBuilder(options, context,
{ buildPlugins })`. `import.meta.env` is replaced as a whole object so
   `DEV`/`SSR`/bracket-access reads in the router runtime are statically
   defined. The builder emits a browser and a server bundle from one set
   of options, and `define` is shared between them, so the plugin sets
   `import.meta.env` from inside `setup()` — which runs once per esbuild
   build — detecting the server bundle the same way Angular does, via
   its `ngServerMode` override. `SSR` must be right per bundle:
   `request-context.ts` reads `window` behind a `!SSR` guard, and the
   content package uses `SSR` to await content and transfer the TOC.

Markdown content follows the same shape:

4. `analogContentPlugin` (esbuild) resolves `analog:content-files` to
   two maps: `contentFilesList` (front matter attributes parsed at build
   time — the `?analog-content-list=true` equivalent) and `contentFiles`
   (lazy raw content — the `?analog-content-file=true` equivalent). It
   also loads `.md` files as text with the markdown body pre-rendered to
   HTML at build time via the same shared marked + shiki/prism setup the
   Vite content plugin uses, front matter preserved.
5. The boot module likewise registers both content maps with
   `@analogjs/content`, whose glob-backed
   `CONTENT_FILES_LIST_TOKEN` / `CONTENT_FILES_TOKEN` factories fall
   back to them — pure DI, no module patching — so `injectContent`,
   `injectContentFiles`, and the content loaders work unchanged
   (`ɵwithContentFiles` remains as an internal override seam).
6. Markdown route files merge into the `analog:route-files` map (values
   resolve to the raw content string), so `createRoutes` turns them into
   routes through the existing `toMarkdownModule` path. The router
   plugin's `.md` imports rely on `analogContentPlugin` being registered
   alongside it, which the builder wrappers always do.

Virtual modules and the type system: the `analog:*` imports typecheck
only because of the ambient `declare module` declarations below — the
Angular build runs a real TypeScript program that would otherwise fail
with TS2307, while at bundle time the plugins' `onResolve` intercepts
the specifiers before any filesystem resolution. This is the same
pattern as `vite/client`'s ambient types for `import.meta.glob`. The
declarations ship with the package: apps add
`"types": ["@analogjs/platform/esbuild-env"]` to their tsconfig. The
plugins themselves are also importable from `@analogjs/platform/esbuild`
for custom esbuild setups.

## App wiring

```jsonc
// angular.json
"build": { "builder": "@analogjs/platform:application", /* usual options */ },
"serve": { "builder": "@analogjs/platform:dev-server", /* usual options */ }
```

Analog-specific settings live in an `analog` section of the build
options, read by both builders and stripped before the rest passes
through to `@angular/build`:

```jsonc
// build options
"analog": {
  "highlighter": "shiki", // or "prism"; shiki is the default
  "mermaid": true, // pass mermaid fences through for client rendering
  "markedOptions": {}, // build-time marked setup, as on the Vite path
  "shikiOptions": {}, // shiki themes/langs/container
  "prismOptions": {}, // prism additionalLangs
  "additionalPagesDirs": [],
  "additionalContentDirs": [],
  "additionalAPIDirs": [], // <dir>/routes scanned for API routes
  "streaming": false, // EXPERIMENTAL streaming SSR patch
  "sitemap": { "host": "https://example.com" } // emit sitemap.xml
}
```

```jsonc
// tsconfig.app.json — pages must be part of the TypeScript program,
// and the shipped analog:* declarations referenced when a file
// imports them directly (the default wiring needs none)
"compilerOptions": {
  "types": ["@analogjs/platform/esbuild-env"]
},
"include": ["src/**/*.d.ts", "src/**/*.page.ts"]
```

```ts
// app.config.ts — identical to a Vite app; no analog:* imports
import { provideFileRouter } from '@analogjs/router';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

export const appConfig = {
  providers: [
    provideFileRouter(),
    // Only needed when using markdown content; loadMermaid only when
    // rendering mermaid diagrams
    provideContent(
      withMarkdownRenderer({ loadMermaid: () => import('mermaid') }),
    ),
  ],
};
```

The builders inject a boot module into every bundle that registers the
discovered maps with the packages (via internal setters), and
`provideFileRouter` / `provideContent` fold them in at DI time when the
Vite globs are empty. The former explicit bridges
(`withRouteFiles`, `withPageEndpoints`, `withContentFiles`) are
internal now (`ɵ`-prefixed) — overrides go through `withConfig`, and
custom esbuild setups register `analogInitPlugin` alongside the other
plugins instead. The registration is per-graph module state, deliberately not a
global: the Angular builder bundles the server entry and main.server as
separate graphs, each with its own copies of the packages and app, and
a process-wide global would hand one graph's component defs to the
other graph's router (a cross-runtime NG0203 at outlet activation —
found the hard way).

Mermaid parity matches the Vite path exactly, including its shape:
diagrams render client-side through `<analog-markdown>`
(`injectContent` pages, like the fixture's `blog/[slug].page.ts`), while
markdown content _routes_ pass the fences through as
`<pre class="mermaid">` without rendering them — the route component has
no mermaid wiring upstream on either build path.

## SSR and prerendering

SSR runs on `@angular/ssr`, not Nitro. Point `server` at the bootstrap
entry, `ssr.entry` at a request handler, set `outputMode` to `server`
(add `prerender` for SSG), list both entries in the TypeScript program,
and build the server route configuration from the same route files:

```jsonc
// project.json / angular.json build options
"server": "src/main.server.ts",
"outputMode": "server",
"ssr": { "entry": "src/server.ts" },
"prerender": true,
"security": { "allowedHosts": ["localhost"] }
```

The three server files stay thin — the machinery lives in
`@analogjs/router`:

```ts
// src/app/app.config.server.ts
import { mergeApplicationConfig } from '@angular/core';
import {
  provideAnalogServerRendering,
  withConfig,
  withRoutes,
} from '@analogjs/router/ssr';

import { appConfig } from './app.config';

export const config = mergeApplicationConfig(appConfig, {
  providers: [
    provideAnalogServerRendering(
      withConfig({ debugRoutes: true }), // when using withDebugRoutes
      // server routes for paths outside the file map, e.g. covering a
      // withExtraRoutes route from the app config
      withRoutes([{ path: 'about', renderMode: RenderMode.Server }]),
    ),
  ],
});
```

```ts
// src/main.server.ts
export default (context: BootstrapContext) =>
  bootstrapApplication(AppComponent, config, context);
```

```ts
// src/server.ts
import { createAnalogRequestHandler } from '@analogjs/router/ssr';

import { config } from './app/app.config.server';

export const reqHandler = createAnalogRequestHandler({
  config, // server-fn dispatch resolves the app's own DI
  main: import.meta.url, // listens on PORT when run directly
});
```

`provideAnalogServerRendering` reads the maps the injected boot module
registered and derives the @angular/ssr server route configuration (via
`createAnalogServerRoutes`, also exported for direct use with an
explicit files map). It follows the `with*` feature convention:
`withConfig` for the debug-routes flag and map overrides, `withRoutes`
for server routes covering paths outside the file map. The derivation:
static paths prerender, dynamic
module-backed paths prerender the parameter sets their
`routeMeta.getPrerenderParams` provides (resolving empty falls back to
per-request via `PrerenderFallback.Server`), and everything
server-backed renders per request — pages with a `.server.ts` endpoint
are detected automatically, and a page opts itself out of prerendering
with `routeMeta.prerender: false` (a literal, extracted at build time)
when its server data must stay per-request — fresh server-function
values (`routeMeta.streaming: true` implies it). Intermediate parent
paths are included, since
nested route files produce a parent route Angular's server
configuration must cover. It also installs
`provideServerRequestContext()`.

Content-backed dynamic routes prerender in batch by declaring it in
the page itself — `fromContentDir` builds a `getPrerenderParams` that
yields one parameter set per content file (slug from front matter or
the file basename; a `transform` maps files onto other parameters or
skips them). It reads the content list from DI, so it runs anywhere
server routes are extracted:

```ts
// blog/[slug].page.ts
export const routeMeta: RouteMeta = {
  getPrerenderParams: fromContentDir('src/content/blog'),
};
```

This is the esbuild-native shape of Nitro's `PrerenderContentDir` —
parameters instead of route strings, colocated with the page like every
other per-page decision (`routeMeta.prerender: false` opts a page out
of prerendering the same way). Unmatched parameters still render per
request. Pair it with `analog.sitemap: { host }` in the builder
options, which emits a `sitemap.xml` into the browser output after a
successful prerendering build, one entry per prerendered page.

`createAnalogRequestHandler` is the whole server entry: server
functions, page endpoints, and API routes ahead of Angular, static
browser assets with real MIME types (strict module-script checking
rejects assets without one), then `AngularNodeAppEngine` — falling
through to `next()` under the dev server, and self-listening when the
bundle is run directly. It consumes the `analog:*` maps itself, via
literal dynamic imports the esbuild plugins resolve when the server
entry is bundled; anywhere else (plain node, tests) those imports fail
at runtime, are caught, and everything resolves empty — so the built
package still loads outside the plugin pipeline. Explicit
`apiRoutes` / `pageEndpoints` / `serverFns` options override the loaded
maps for custom setups. The server-fn dispatch route is only mounted
when server functions were discovered.

Notes:

- The server entry must be listed in `tsconfig.app.json` (`files` or
  `include`), or it is bundled without type checking.
- `bootstrapApplication` needs the `BootstrapContext` argument on the
  server, otherwise route extraction fails with NG0401.
- Type `serverRoutes` as `ServerRoute[]` and build each entry in its own
  branch; a single object literal with a computed `renderMode` widens to
  `RenderMode` and fails to match the discriminated union.
- `@angular/ssr` rejects requests whose `Host` header is not listed in
  `security.allowedHosts`, so a served app needs its hostnames there.

Analog's `REQUEST` / `RESPONSE` / `BASE_URL` / `LOCALE` tokens are
populated by `provideServerRequestContext()` from the
`@analogjs/router/ssr` entry point, added to the server config's
providers. It adapts the web `Request` and `ResponseInit` that
`@angular/ssr` exposes through `@angular/core`'s
`REQUEST` / `RESPONSE_INIT` tokens into the node-flavored shapes
Analog's consumers read — request url/method/headers, response status
and headers (written through to the `ResponseInit` Angular uses to
build the response), and the request origin as `BASE_URL`. The locale
is detected the same way as the Nitro server context (URL path prefix,
then `Accept-Language`), with the shared detection helpers now living
in `@analogjs/router/tokens`; locale-aware content wires up through
`withLocale({ loadLocale: injectLocale })` exactly as on Vite. Each token resolves to null outside a server
request; prerendered pages have no request, so only per-request renders
carry the context. The entry point lives outside the main entries
because `@angular/core`'s `REQUEST` token only exists in Angular v19+,
which the rest of the router does not require.

## API routes

h3 handlers in `src/server/routes` are served with the same filename
conventions as the Nitro path — nested directories, `[param]`,
`[...slug]`, `index`, and `.get.ts`-style method suffixes. Discovery
follows the manifest pattern, so adding or removing a handler rebuilds
in watch mode. Wiring:

- The `analog:api-routes` virtual module maps discovered files to lazy
  imports (empty in browser bundles, so handler code never reaches the
  client). Handler files must be in the TypeScript program:
  `"include": ["src/server/**/*.ts"]`.
- `createAnalogRequestHandler` mounts them ahead of Angular (requires
  the optional `h3` and `radix3` peers). For a custom server entry, the
  underlying `createApiRoutesHandler` is exported too:

```ts
const api = createApiRoutesHandler(apiRoutes);
// in the request handler, before assets/Angular:
if (api.matches(pathname)) {
  return api.handler(req, res);
}
```

- In dev, a configured server entry (`outputMode` + `ssr.entry`) is
  used directly: Angular's dev server forwards requests to the entry's
  `reqHandler`, so the same handler chain runs in dev and prod. Without
  a server entry, the dev-server wrapper serves the handlers through
  dev middleware, bundling them on demand with esbuild and rebuilding
  when a handler changes.

## Server middleware

`src/server/middleware` follows Nitro's global-middleware convention:
every file's default h3 event handler runs on **every** request — page
renders and static assets included — in filename order, ahead of all
other handlers. Middleware acts by ending the response (`sendRedirect`,
`res.end`) or mutating `event.context`; return values are ignored. The
`analog:server-middleware` map is consumed by
`createAnalogRequestHandler` internally (discovery-manifest pattern, so
add/remove rebuilds in watch), and context written by middleware is
bridged into the API route, page endpoint, and server-function apps, so
handlers read `event.context` the way they would under Nitro's shared
app. One seam vs. Nitro: `event.context` does not flow into Angular
page renders — the render reads the bridged Angular `REQUEST`, not the
h3 event — so middleware affects pages via headers and redirects only.
Requires a configured server entry (the no-entry dev middleware
fallback does not run it).

## Page endpoints

`.server.ts` page endpoints work with the Nitro path's semantics: GET
runs the module's `load`, other methods run `action`, both receiving
`{ params, req, res, fetch, event }`, served at
`/api/_analog/pages/...`. Wiring on top of the API routes setup:

- The `analog:page-endpoints` virtual module maps endpoint keys to lazy
  imports in the server bundle and to `true` in the browser bundle —
  enough for the router to know which routes fetch load data, with no
  server code in the client.
- `withPageEndpoints(pageEndpoints)` (a `provideFileRouter` feature)
  hands the map to the router, replacing the Vite-only endpoint glob,
  and `provideHttpClient(withFetch())` backs the load resolver's fetch.
- `createAnalogRequestHandler` mounts the endpoint handler ahead of the
  API routes handler (`createPageEndpointsHandler` for custom entries).
- Endpoint files join the TS program via
  `"include": ["src/app/pages/**/*.server.ts"]`, and pages must import
  their endpoint's types with `import type` only — there is no client
  scrub, so a value import would pull server code into the browser
  bundle.
- Endpoint-backed pages need `RenderMode.Server`: the load resolver
  fetches the live endpoint through the bridged `BASE_URL`, and during
  prerendering there is no server to fetch from.
- The `fetch` handed to `load`/`action` has Nitro `$fetch` semantics:
  relative URLs resolve against the request's own origin and the body
  comes back parsed (JSON for JSON responses).
- Form actions work on top of this: the `FormAction` directive posts to
  the same endpoint route, the `action` reads the form body (e.g. h3's
  `readFormData`), and the `@analogjs/router/server/actions` helpers
  (`json`, `fail`, `redirect`) return web Responses that h3 writes
  through — status, `X-Analog-Errors` header and all.

## Server functions

`serverFn` / `injectServerFn` work end to end, dispatched at the same
opaque `/_analog/fn/<id>` routes as the Nitro path (ids derived as
`hash(fileRelativePath#exportName)` by the shared algorithm). The
enabling mechanism is whole-module substitution: the Angular compiler
plugin owns TypeScript loads and cannot be chained, so
`analogServerFnsPlugin` captures `*.server.ts` imports at resolve time
into a private namespace (extensionless path, so the compiler plugin's
namespace-less `.ts` loader cannot match) and serves a per-bundle
transform —

- **Browser bundles** get the client scrub: each
  `export const fn = serverFn(…)` becomes a `createServerFnRef` proxy;
  handlers and their server-only imports drop out of the bundle
  entirely. Pure page endpoints under `pages/` are emptied, matching
  the Vite client build.
- **Server bundles** keep the real implementation with the derived id
  stamped into each `serverFn` config, so registration and the client
  proxy agree on the route.

Wiring on top of the API routes setup:

- The `analog:server-fns` map holds every discovered module's namespace
  — importing it registers each function by id.
  `createAnalogRequestHandler` consumes it internally and mounts the
  dispatch route only when functions were discovered, bootstrapping the
  dispatch parent injector from `config`
  (`createServerFnAppInjector`); passing the app's own server config
  gives handlers the same DI as an SSR render.
- `provideServerRequestContext()` provides the `SERVER_FN_DISPATCHER`,
  so functions called during SSR dispatch in-process — no HTTP
  round-trip — and seed `TransferState` for hydration. During
  prerendering dispatch runs against a synthetic request (as on Nitro),
  so server-function pages prerender with the values baked in; list a
  page opts out with `routeMeta.prerender: false` when its server data
  must stay per-request.

Debug routes work too: `withDebugRoutes()` reads the same registered
files map (or the `ROUTE_FILES` token when overridden), so
`/__analog/routes` lists the discovered files. Give it a
`RenderMode.Server` entry in the server routes, since it is not part of
the file map.

## Streaming SSR (experimental)

`renderStream` works on the esbuild path with the same experimental
status as on Vite. Three pieces:

- `analog.streaming: true` in the builder options enables
  `analogDeferStreamingPlugin`, which applies the same
  `injectDeferStreamingHook` string patch the Vite plugin uses to
  `@angular/core`'s `@defer` runtime — delivered by resolve-time module
  capture, since Angular's own JS loader owns module loads. Server
  bundles only; drift in Angular's internals degrades to buffered with
  a warning, same as Vite.
- A page opts in with `routeMeta.streaming: true` (a literal, extracted
  at build time). It implies `prerender: false` — streaming needs a
  live request — so that is the page's only declaration. Because the
  opt-in is a route rather than a URL string, a dynamic route
  (`blog/[slug]`) streams every URL it matches.
- `createAnalogRequestHandler` takes `streaming: { component }`: it
  derives the streamed routes from the pages themselves and bypasses
  `AngularNodeAppEngine` (which buffers) for those, rendering through
  `renderStream` against the CSR index document and piping the stream
  to the response. The component is the one app-level piece —
  `renderStream` drives the platform directly, so it needs a root to
  bootstrap. Bots and `streaming: false` routes get the buffered
  fallback inside `renderStream`.
- The app needs `withIncrementalHydration()`; `@defer (hydrate …)`
  blocks flush as they resolve, then the authoritative
  hydration-annotated document arrives as the tail.

With this, no Analog capability is Nitro-only — the streaming patch
would still be better served by an upstream Angular per-block
resolution hook, which would delete the string patch on both paths.

## Verification

`apps/esbuild-app` is a minimal Angular app that resolves the builders
by name and builds through the real `buildApplication` (Angular v22).
`nx verify esbuild-app` builds it and asserts the output:

```sh
nx build esbuild-app             # or: nx serve esbuild-app
nx verify esbuild-app            # builds, then checks the emitted bundles and HTML
nx verify-browser esbuild-app    # boots the server and drives Chromium via Playwright
nx verify-dev-server esbuild-app # serves, then edits and adds pages and polls the served bundles
nx verify-prod esbuild-app       # production configuration (optimization + hashing), then both verifies
```

Confirmed against a real build:

- **Name resolution** — `@analogjs/platform:application` and
  `:dev-server` resolve from the built package through Nx and the
  Angular CLI's own resolution path.

- **Plugin ordering** — `codePlugins` resolve `analog:route-files` and
  `analog:content-files`, and load `.md`, without interference from
  Angular's own compiler plugin.
- **AOT** — pages are compiled by the Angular compiler as part of the
  TS program (`ɵɵdefineComponent` in the output), so `.page.ts` files
  need no separate compile step.
- **Code splitting** — Angular reports lazy chunks named `index-page`,
  `[productId]-page`, and `about-md`, one per route file.
- **Markdown parity** — the emitted content chunk preserves front
  matter and contains HTML rendered at build time with shiki
  highlighting applied, matching the Vite `?analog-content-file=true`
  output shape.
- **Watch** — file edits rebuild, and adding or removing a page file
  that nothing imports rebuilds and updates the route map, in both
  `build --watch` and the dev server, driven by the discovery manifest.
- **DI bridges in a real bundle** — `provideFileRouter(withRouteFiles(…))`
  plus `withContentFiles(…)` compile and bundle, emitting per-route
  chunks alongside lazy `@analogjs/router` / `@analogjs/content` chunks.
- **Stable heading ids** — the marked heading-id slugger is stateful and
  the setup is a module singleton, so the content plugin resets it per
  render; otherwise a file rendered for both bundles gets different ids
  in each, and the client would disagree with the SSR output.
- **Per-bundle env** — with `ssr: true` the browser bundle gets
  `{ PROD: true, DEV: false, SSR: false }` and the server bundle
  `{ PROD: true, DEV: false, SSR: true }`; `PROD` is the complement of
  `DEV`, as on Vite.
- **Production configuration** — `nx verify-prod` runs the same output
  and browser suites against an optimized, hashed build. The env
  values, the server-fn scrub, streaming, and the full browser pass all
  hold under minification; the server boots without Angular's
  dev-mode notice. Angular's optimizer mangles every `ɵ` symbol, so
  the AOT assertion falls back to proving the JIT compiler is absent
  from the browser output.
- **SSR output** — with `prerender: true` the emitted HTML contains the
  server-rendered page component, markdown rendered from a content
  route (with highlighting), the front-matter title applied by
  `provideFileRouter`'s meta-tag initializer, and the content TOC
  transferred through `ng-state` for hydration.
- **Serving** — `nx verify` boots the built server entry and requests a
  `RenderMode.Server` route, which comes back rendered per request
  (`ng-server-context="ssr"`, route parameter resolved), while
  prerendered paths are served as `ssg`.
- **Page endpoints** — `GET /api/_analog/pages/feedback` runs the
  fixture endpoint's `load`, `POST` runs its `action`, and the SSR
  render of `/feedback` contains the load data — the resolver
  self-fetched the endpoint through `HttpClient` and the bridged
  `BASE_URL`. The browser run confirms the page hydrates with the same
  data, and the dev-server run confirms both handlers serve through the
  app's own server entry under `ng serve`.
- **Server functions** — the handler string is absent from every
  browser chunk while the derived id is present (the scrub shipped the
  proxy, not the implementation); `GET`/`POST /_analog/fn/<derived id>`
  dispatch over HTTP with the id computed independently by the verify
  script; `/fn-demo` prerenders as `ssg` with the function's value
  baked in (in-process dispatch against the synthetic prerender
  request); the browser run hydrates it from the `TransferState` seed
  with zero console errors; and the dev-server run dispatches through
  the app's server entry under `ng serve`.
- **Form actions** — a form-encoded POST to the page endpoint runs the
  `action` and returns the `json()` helper's Response; a missing field
  comes back as `fail(422, …)` with the `X-Analog-Errors` header. In
  Chromium the `FormAction` directive submits the form and emits
  `onSuccess` with the saved value, then emits `onError` with the
  validation errors on the failure submit.
- **Debug routes** — the SSR render of `/__analog/routes` lists the
  discovered route files, read from the `withRouteFiles` map.
- **Server middleware** — `/checkout` comes back 302 with the
  middleware's header on a page path (prod and dev alike), and
  `/api/context` returns the value the middleware wrote to
  `event.context`, proving the context bridge into the API apps.
- **Content-dir prerender + sitemap** — `/blog/about` is static output
  (`ssg`) expanded from `src/content`, and the emitted `sitemap.xml`
  lists exactly the prerendered pages (per-request routes absent).
- **Streaming SSR** — `/stream-demo` answers chunked with the shell,
  both `@defer` blocks as `data-analog-defer` templates, and the
  authoritative tail; a bot user-agent gets a buffered render with no
  streamed templates; and in Chromium (with a non-headless UA — the
  headless UA matches the bot fallback) the streamed page settles with
  both blocks and zero console errors.

Name resolution found a packaging bug: Angular's host rejects builder
implementation paths starting with `..`, so the entries could not live
in the nx-plugin's `executors.json` (which sits a directory away from
the esbuild output). The builders are declared in a package-root
`builders.json` instead, with `package.json#builders` pointing at it
and the existing string aliases carried over; `package.json#executors`
still points at the nx manifest for Nx. Nx-side resolution has its own
gotcha, found via `apps/esbuild-app`: the entries must not appear under
an `executors` manifest key, or Nx loads the architect `Builder` object
as a plain Nx executor and fails with "implementation is not a
function".

A spike also validated the client-side module substitution the future
`.server.ts` endpoint scrub needs: a custom `onResolve` can capture
browser-bundle imports of server modules into a namespace and serve a
scrubbed replacement, with the server bundle untouched. Two esbuild
rules make it work: a namespace-less `onLoad` (like the Angular
compiler plugin's TS loader) matches **all** namespaces, so the
captured path must not match its filter — resolve to the extensionless
specifier and read the file in the loader — and the original file can
stay in the TypeScript program for type-checking, since the compiler
plugin only errors on files it actually loads.

`nx verify-browser esbuild-app` closes the loop in a real browser: it
boots the built server and drives Chromium (Playwright) to assert that
served pages carry hydration annotations and hydrate cleanly under
`provideClientHydration()` (zero console errors — a mismatch would emit
NG05xx), that client-side navigation lazy-loads both a page route and a
markdown content route without a full reload, and that the bridged
`BASE_URL` survives client takeover via `TransferState`. Two things the
browser run forced on the fixture: assets must be served with real MIME
types (module scripts are rejected otherwise), and any server-only
value rendered into the DOM must be transferred so hydration sees equal
markup.

## Open items

- Mermaid rendering inside markdown content routes would need the
  upstream route component to gain mermaid wiring — it has none on the
  Vite path either.
- Out of scope by decision: scaffolding, fine-grained HMR (rebuild +
  live reload is the dev loop), and automatic `.env` loading (the
  plugin `env` option covers explicit values). Declarative route rules
  are covered imperatively by server middleware; deployment targets
  beyond the Node server come from the @angular/ssr ecosystem.
