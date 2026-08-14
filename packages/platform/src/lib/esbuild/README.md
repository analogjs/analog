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
- `nx build --watch` rebuilds on file edits, and adding or removing a
  page triggers a rebuild within a few seconds — plugin `watchDirs` are
  honored — with route/content discovery re-running on every rebuild
  (the virtual modules are not stale-cached).
- `nx serve` serves the app with both plugins active. Rebuild-on-edit
  did not propagate through the dev server in the validation container
  even though plain `build --watch` rebuilds fine; see open items.

## Design

Instead of patching `@analogjs/router`'s published FESM (which would
race the Angular CLI's own JS transform pipeline and bypass the Angular
linker), route files are surfaced through a virtual module:

1. `analogRouterPlugin` (esbuild) resolves `analog:route-files` to a
   generated module mapping route file keys to `() => import(...)`
   entries. esbuild code-splits each page into a lazy chunk. Page
   directories are registered as `watchDirs` so adding/removing a page
   triggers a rebuild in watch mode.
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
pattern as `vite/client`'s ambient types for `import.meta.glob`; a
published version should ship these declarations in the packages so
apps reference them from tsconfig `types` instead of hand-writing them.

## App wiring

```jsonc
// angular.json
"build": { "builder": "@analogjs/platform:application", /* usual options */ },
"serve": { "builder": "@analogjs/platform:dev-server", /* usual options */ }
```

```jsonc
// tsconfig.app.json — pages must be part of the TypeScript program
"include": ["src/**/*.d.ts", "src/**/*.page.ts"]
```

```ts
// src/analog-routes.d.ts
declare module 'analog:route-files' {
  const files: import('@analogjs/router').Files;
  export default files;
}

declare module 'analog:content-files' {
  export const contentFilesList: Record<string, Record<string, unknown>>;
  export const contentFiles: Record<string, () => Promise<string>>;
}
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
    // Only needed when using markdown content
    provideContent(withMarkdownRenderer()),
    provideContentFiles({ list: contentFilesList, files: contentFiles }),
  ],
};
```

## SSR and prerendering

SSR runs on `@angular/ssr`, not Nitro. Add `server`, `ssr` and (for SSG)
`prerender` to the builder options, put the server entry in the
TypeScript program, and build the server route configuration from the
same route files:

```ts
// src/main.server.ts
import {
  provideServerRendering,
  withRoutes,
  RenderMode,
  type ServerRoute,
} from '@angular/ssr';
import {
  createRoutePaths,
  provideFileRouter,
  withRouteFiles,
} from '@analogjs/router';
import routeFiles from 'analog:route-files';

// Static paths prerender; paths with parameters or wildcards render per
// request, since their values are not known at build time.
const serverRoutes: ServerRoute[] = createRoutePaths(routeFiles).map((path) =>
  path.includes(':') || path.includes('*')
    ? { path, renderMode: RenderMode.Server }
    : { path, renderMode: RenderMode.Prerender },
);

export default function bootstrap(context: BootstrapContext) {
  return bootstrapApplication(
    AppComponent,
    { providers: [provideServerRendering(withRoutes(serverRoutes)) /* … */] },
    context,
  );
}
```

`createRoutePaths` (new in `@analogjs/router`) returns the full path of
every route file using the same filename rules as `createRoutes`,
including intermediate parent paths — nested route files produce a
parent route even with no layout file for that segment, and Angular
rejects a server configuration that omits it.

Notes:

- The server entry must be listed in `tsconfig.app.json` (`files` or
  `include`), or it is bundled without type checking.
- `bootstrapApplication` needs the `BootstrapContext` argument on the
  server, otherwise route extraction fails with NG0401.
- Type `serverRoutes` as `ServerRoute[]` and build each entry in its own
  branch; a single object literal with a computed `renderMode` widens to
  `RenderMode` and fails to match the discriminated union.

Still Nitro-only, so unavailable here: `injectLoad` and `.server.ts`
page endpoints, form actions, server functions, and streaming SSR.
Analog's `REQUEST` / `RESPONSE` tokens are also unpopulated — they are
typed against `node:http` for Nitro/h3, whereas `@angular/ssr` exposes a
web `Request` through `@angular/core`'s own `REQUEST` token. Nothing in
the supported surface reads them (the cookie interceptor only acts on
`/_analog/` endpoint requests), so a bridge was left out for now.

## Verification

`apps/esbuild-app` is a minimal Angular app that resolves the builders
by name and builds through the real `buildApplication` (Angular v22).
`nx verify esbuild-app` builds it and asserts the output:

```sh
nx build esbuild-app     # or: nx serve esbuild-app
nx verify esbuild-app    # builds, then checks the emitted bundles and HTML
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
  matter and contains HTML rendered at build time with prism
  highlighting applied, matching the Vite `?analog-content-file=true`
  output shape.
- **Watch** — adding a page file that nothing imports triggers a
  rebuild and is picked up, so `watchDirs` drives the add-a-page DX.
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

Not yet exercised: booting the built app in a browser (only bundle
contents are asserted).

## Open items

- Investigate dev-server rebuild propagation: file edits did not reach
  the served bundles in the validation container even though plain
  `build --watch` rebuilds (including `watchDirs`), so the gap is in
  the dev-server layer — possibly this workspace's Vite 8 override
  meeting `@angular/build`'s expected Vite version. Verify in a
  standard CLI workspace.
- Add `@angular-devkit/architect` / `@angular/build` as optional peer
  dependencies.
- The package `exports` map does not expose `./src/lib/esbuild/*`, so
  the plugins cannot be imported directly for custom esbuild setups.
  Builder resolution is unaffected (it resolves by file path).
- Ship the ambient `declare module 'analog:*'` declarations in the
  packages instead of asking apps to hand-write them.
- Pass through marked/shiki/prism options (`markedOptions`,
  `shikiOptions`, `additionalLangs`) to the content plugin's build-time
  rendering; only the highlighter choice is exposed for now.
- Agnostic/mermaid renderer parity for content beyond the default
  markdown renderer path.
- SSR remaining work:
  - `getPrerenderParams` for `[param]` routes, so they can be
    prerendered instead of only server rendered; the render-mode choice
    is currently the app's to make, and could be read from `routeMeta`
  - a bridge populating Analog's `REQUEST` / `RESPONSE` / `BASE_URL`
    from `@angular/core`'s `REQUEST`, once something in the supported
    surface needs it; note it cannot be imported unconditionally,
    since the token does not exist in the older Angular versions the
    router still supports
  - serving through a running server (only prerendered output and
    bundle contents are asserted)
- Version-gate against Angular majors (v18+ only; v17 used
  `@angular-devkit/build-angular` internals).
