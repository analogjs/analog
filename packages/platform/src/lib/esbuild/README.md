# Analog file-based routes on the Angular application builder (sketch)

Status: **proof-of-concept sketch.** The builders are registered in the
platform package manifest (`packages/nx-plugin/executors.json`) and
validated against a real Angular v22 build through two fixtures:
`.esbuild-fixture/` drives `buildApplication` directly via the architect
testing host, and `apps/esbuild-app` resolves the builders by name
through Nx (`nx build esbuild-app` / `nx serve esbuild-app`). Scope is
client-side file routing only — the Nitro server features (API routes,
`.server.ts` page endpoints, form actions, server functions, SSR/SSG)
are intentionally out of scope.

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
{ buildPlugins })`. `routerDefine` replaces the whole
   `import.meta.env` object so `DEV`/`SSR`/bracket-access reads in the
   router runtime are statically defined.

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

## Verification

`.esbuild-fixture/` is a minimal Angular app driven through the real
`buildApplication` (Angular v22) via `@angular-devkit/architect`'s
testing host — `run-build.ts` for a one-shot build, `run-watch.ts` for
watch mode. Bundle each with esbuild and run on node (the builder's
dynamic `import('@angular/build')` does not survive a VM-based TS
loader):

```sh
cd .esbuild-fixture
../node_modules/.bin/esbuild run-build.ts --bundle --format=esm \
  --platform=node --packages=external --outfile=run-build.mjs
node run-build.mjs
```

Confirmed against a real build:

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

Builder resolution by name (`@analogjs/platform:application`) is
exercised by `apps/esbuild-app` through Nx. One manifest gotcha found
doing so: the entries must live only under the `builders` key of the
manifest — duplicating them under `executors` makes Nx load the
architect `Builder` object as an Nx executor and fail with
"implementation is not a function".

Not yet exercised: booting the built app in a browser against
`withRouteFiles` / `provideContentFiles`. The DI bridges themselves are
covered by unit tests in their own packages.

## Open items

- Investigate dev-server rebuild propagation: file edits did not reach
  the served bundles in the validation container even though plain
  `build --watch` rebuilds (including `watchDirs`), so the gap is in
  the dev-server layer — possibly this workspace's Vite 8 override
  meeting `@angular/build`'s expected Vite version. Verify in a
  standard CLI workspace.
- Add `@angular-devkit/architect` / `@angular/build` as optional peer
  dependencies of the platform package.
- Ship the ambient `declare module 'analog:*'` declarations in the
  packages instead of asking apps to hand-write them.
- Pass through marked/shiki/prism options (`markedOptions`,
  `shikiOptions`, `additionalLangs`) to the content plugin's build-time
  rendering; only the highlighter choice is exposed for now.
- Agnostic/mermaid renderer parity for content beyond the default
  markdown renderer path.
- `DEV` in `routerDefine` is flipped via build configurations for now;
  the dev-server wrapper cannot override the build target's `define`.
- Per-bundle `SSR` define (browser vs. server) once `@angular/ssr`
  support is explored.
- Version-gate against Angular majors (v18+ only; v17 used
  `@angular-devkit/build-angular` internals).
