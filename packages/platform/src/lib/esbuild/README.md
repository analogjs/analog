# Analog file-based routes on the Angular application builder (sketch)

Status: **proof-of-concept sketch.** The builders are registered in a
package-root `builders.json` (see Verification for why) and validated
against a real Angular v22 build by `apps/esbuild-app`, which resolves
them by name (`nx build esbuild-app` / `nx serve esbuild-app`, with
`nx verify esbuild-app` asserting the output). Covers file-based
routing, markdown content routes, and SSR/SSG through `@angular/ssr`.
The Nitro server features — API routes, `.server.ts` page endpoints,
form actions, server functions, and streaming SSR — are intentionally
out of scope.

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
2. `withRouteFiles(routeFiles)` (new public API in `@analogjs/router`)
   feeds that map into `createRoutes` via the `ROUTES` multi-provider —
   the same mechanism as `withExtraRoutes`. The glob-based `routes`
   array is empty outside of Vite, so the file routes are the effective
   route table, and all `provideFileRouter` features (meta tags, cookie
   interceptor, API prefix) keep working.
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
5. `provideContentFiles({ list, files })` (new public API in
   `@analogjs/content`) overrides the glob-backed
   `CONTENT_FILES_LIST_TOKEN` / `CONTENT_FILES_TOKEN` factories with the
   supplied maps — pure DI, no module patching — so `injectContent`,
   `injectContentFiles`, and the content loaders work unchanged.
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
  "additionalPagesDirs": [],
  "additionalContentDirs": []
}
```

```jsonc
// tsconfig.app.json — pages must be part of the TypeScript program,
// and the shipped analog:* declarations must be referenced
"compilerOptions": {
  "types": ["@analogjs/platform/esbuild-env"]
},
"include": ["src/**/*.d.ts", "src/**/*.page.ts"]
```

```ts
// app.config.ts
import { provideFileRouter, withRouteFiles } from '@analogjs/router';
import {
  provideContent,
  provideContentFiles,
  withMarkdownRenderer,
} from '@analogjs/content';
import routeFiles from 'analog:route-files';
import { contentFilesList, contentFiles } from 'analog:content-files';

export const appConfig = {
  providers: [
    provideFileRouter(withRouteFiles(routeFiles)),
    // Only needed when using markdown content; loadMermaid only when
    // rendering mermaid diagrams
    provideContent(
      withMarkdownRenderer({ loadMermaid: () => import('mermaid') }),
    ),
    provideContentFiles({ list: contentFilesList, files: contentFiles }),
  ],
};
```

Mermaid parity matches the Vite path exactly, including its shape:
diagrams render client-side through `<analog-markdown>`
(`injectContent` pages, like the fixture's `blog/[slug].page.ts`), while
markdown content *routes* pass the fences through as
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

`src/server.ts` is an ordinary `@angular/ssr/node` handler — the same
one the Angular CLI scaffolds — so nothing Analog-specific is needed
there. See `apps/esbuild-app/src/server.ts` for a dependency-free
version built on `node:http` rather than Express.

```ts
// src/main.server.ts
import {
  provideServerRendering,
  withRoutes,
  RenderMode,
  type ServerRoute,
} from '@angular/ssr';
import { createServerRoutePaths } from '@analogjs/router';
import routeFiles from 'analog:route-files';

// Static paths prerender. Dynamic module-backed paths prerender the
// parameter sets their routeMeta.getPrerenderParams provides and fall
// back to per-request rendering for anything else; dynamic paths with
// no module render per request.
const serverRoutes: ServerRoute[] = createServerRoutePaths(routeFiles).map(
  (route) =>
    !route.isDynamic
      ? { path: route.path, renderMode: RenderMode.Prerender }
      : route.getPrerenderParams
        ? {
            path: route.path,
            renderMode: RenderMode.Prerender,
            getPrerenderParams: route.getPrerenderParams,
          }
        : { path: route.path, renderMode: RenderMode.Server },
);

export default function bootstrap(context: BootstrapContext) {
  return bootstrapApplication(
    AppComponent,
    {
      providers: [
        provideServerRendering(withRoutes(serverRoutes)),
        provideServerRequestContext(), // from '@analogjs/router/ssr'
      ],
    },
    context,
  );
}
```

`createServerRoutePaths` (new in `@analogjs/router`, alongside the
string-only `createRoutePaths`) returns the full path of every route
file using the same filename rules as `createRoutes`, including
intermediate parent paths — nested route files produce a parent route
even with no layout file for that segment, and Angular rejects a server
configuration that omits it. Dynamic module-backed entries carry a
`getPrerenderParams` loader that reads the page's
`routeMeta.getPrerenderParams` (new optional `RouteMeta` field),
resolving to an empty list when the page does not define one —
`@angular/ssr`'s default `PrerenderFallback.Server` then renders those
paths per request.

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

Analog's `REQUEST` / `RESPONSE` / `BASE_URL` tokens are populated by
`provideServerRequestContext()` from the `@analogjs/router/ssr` entry
point, added to the server config's providers. It adapts the web
`Request` and `ResponseInit` that `@angular/ssr` exposes through
`@angular/core`'s `REQUEST` / `RESPONSE_INIT` tokens into the
node-flavored shapes Analog's consumers read — request url/method/
headers, response status and headers (written through to the
`ResponseInit` Angular uses to build the response), and the request
origin as `BASE_URL`. Each token resolves to null outside a server
request; prerendered pages have no request, so only per-request renders
carry the context. The entry point lives outside the main entries
because `@angular/core`'s `REQUEST` token only exists in Angular v19+,
which the rest of the router does not require.

Still Nitro-only, so unavailable here: `injectLoad` and `.server.ts`
page endpoints, form actions, server functions, and streaming SSR.

## Verification

`apps/esbuild-app` is a minimal Angular app that resolves the builders
by name and builds through the real `buildApplication` (Angular v22).
`nx verify esbuild-app` builds it and asserts the output:

```sh
nx build esbuild-app             # or: nx serve esbuild-app
nx verify esbuild-app            # builds, then checks the emitted bundles and HTML
nx verify-browser esbuild-app    # boots the server and drives Chromium via Playwright
nx verify-dev-server esbuild-app # serves, then edits and adds pages and polls the served bundles
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
  plus `provideContentFiles(…)` compile and bundle, emitting per-route
  chunks alongside lazy `@analogjs/router` / `@analogjs/content` chunks.
- **Stable heading ids** — the marked heading-id slugger is stateful and
  the setup is a module singleton, so the content plugin resets it per
  render; otherwise a file rendered for both bundles gets different ids
  in each, and the client would disagree with the SSR output.
- **Per-bundle env** — with `ssr: true` the browser bundle gets
  `{ DEV: false, SSR: false }` and the server bundle
  `{ DEV: false, SSR: true }`.
- **SSR output** — with `prerender: true` the emitted HTML contains the
  server-rendered page component, markdown rendered from a content
  route (with highlighting), the front-matter title applied by
  `provideFileRouter`'s meta-tag initializer, and the content TOC
  transferred through `ng-state` for hydration.
- **Serving** — `nx verify` boots the built server entry and requests a
  `RenderMode.Server` route, which comes back rendered per request
  (`ng-server-context="ssr"`, route parameter resolved), while
  prerendered paths are served as `ssg`.

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

- Pass through fine-grained marked/shiki/prism options
  (`markedOptions`, `shikiOptions`, `additionalLangs`) to the content
  plugin's build-time rendering; the `analog` builder option section
  covers highlighter choice, mermaid, and extra directories.
- Mermaid rendering inside markdown content routes would need the
  upstream route component to gain mermaid wiring — it has none on the
  Vite path either.
