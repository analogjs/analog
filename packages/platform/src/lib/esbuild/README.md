# Analog file-based routes on the Angular application builder (sketch)

Status: **proof-of-concept sketch, not wired into the published package.**
Scope is client-side file routing only — the Nitro server features
(API routes, `.server.ts` page endpoints, form actions, server
functions, SSR/SSG) are intentionally out of scope.

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
3. Builder wrappers pass the plugin to `@angular/build` (v18+) through
   the public extension points: `buildApplication(options, context,
{ codePlugins })` and `executeDevServerBuilder(options, context,
{ buildPlugins })`. `routerDefine` replaces the whole
   `import.meta.env` object so `DEV`/`SSR`/bracket-access reads in the
   router runtime are statically defined.

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
```

```ts
// app.config.ts
import { provideFileRouter, withRouteFiles } from '@analogjs/router';
import routeFiles from 'analog:route-files';

export const appConfig = {
  providers: [provideFileRouter(withRouteFiles(routeFiles))],
};
```

## Open items

- Register the builders in the published package (merge
  `builders.json` into the platform builders file emitted at build
  time) and add `@angular-devkit/architect` / `@angular/build` as
  optional peer dependencies.
- Markdown content routes (`?analog-content-file=true` pipeline) are
  not handled; needs a text-loader resolve/load pair plus runtime
  rendering wiring.
- `DEV` in `routerDefine` is flipped via build configurations for now;
  the dev-server wrapper cannot override the build target's `define`.
- Per-bundle `SSR` define (browser vs. server) once `@angular/ssr`
  support is explored.
- Version-gate against Angular majors (v18+ only; v17 used
  `@angular-devkit/build-angular` internals).
