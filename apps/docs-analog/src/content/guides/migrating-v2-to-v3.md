import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migrating from Analog v2 to v3

For an existing Analog v2 project, update the packages first and then work through the v3 breaking changes that apply to your app.

## Update the workspace packages

Use the standard Analog update flow for your workspace type:

<Tabs groupId="app-upgrader">
  <TabItem label="ng update" value="ng-update">

```shell
ng update @analogjs/platform@latest
```

  </TabItem>

  <TabItem label="Nx migrate" value="nx-migrate">

```shell
nx migrate @analogjs/platform@latest
```

  </TabItem>
</Tabs>

## v2 to v3 checklist

### Angular version support

Analog v3 requires Angular v20 or newer. The supported range is `^20.0.0 || ^21.0.0 || ^22.0.0`, and support for Angular v16–v19 has been removed. Upgrade the workspace to Angular v20 or newer before adopting the stable v3 line. Projects that need to stay on Angular v17–v19 should remain on Analog v2.x.

The `@angular-devkit/build-angular` fallback in `@analogjs/vite-plugin-angular` has also been removed; `@angular/build` is used for all supported Angular versions.

### Tooling version support

The peer dependency ranges now match the Angular v20 baseline:

- `@analogjs/vitest-angular` requires Vitest `^4.0.7 || ^5.0.0`
- `@analogjs/platform` and `@analogjs/content` require Nx 23.2 or newer (`@nx/angular`, `@nx/devkit`, and `@nx/vite`), and the application and preset generators reject older Nx versions
- `zone.js`, when used, must be `0.15.0` or newer

Upgrade Vitest and Nx before upgrading Analog.

### Removed Analog SFC support

Analog SFC support was removed and `.agx` files are no longer supported. Replace any remaining SFC usage with standard Angular components, markdown content files, or route/page files that use the current Analog conventions.

### `analog()`, `angular()`, and `nitro()` are now separate plugins

Analog v3 splits the Vite plugin chain into three explicit calls. `analog()` no longer internally invokes `@analogjs/vite-plugin-angular` or `@analogjs/vite-plugin-nitro` — you call them yourself. Pass each plugin only the options it owns.

The `nitro()` plugin comes from `@analogjs/vite-plugin-nitro`, which runs on Nitro v2. It reads the options passed to `analog()`, such as `ssr`, `prerender`, and `apiPrefix`, so they are only configured once. Nitro v3 is supported as an opt-in, see [Using Nitro v3](#using-nitro-v3).

Before:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(() => ({
  plugins: [
    analog({
      ssr: true,
      apiPrefix: 'api',
      vite: {
        inlineStylesExtension: 'scss',
        fastCompile: true,
      },
      fileReplacements: [
        { replace: 'src/environment.ts', with: 'src/environment.prod.ts' },
      ],
      nitro: {
        routeRules: { '/admin/**': { ssr: false } },
      },
      prerender: {
        routes: ['/', '/about'],
      },
    }),
  ],
}));
```

After:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import nitro from '@analogjs/vite-plugin-nitro';

export default defineConfig(() => ({
  plugins: [
    analog({
      ssr: true,
      apiPrefix: 'api',
      prerender: {
        routes: ['/', '/about'],
      },
    }),
    angular({
      workspaceRoot: resolve(__dirname, '../..'),
      inlineStylesExtension: 'scss',
      fastCompile: true,
      fileReplacements: [
        { replace: 'src/environment.ts', with: 'src/environment.prod.ts' },
      ],
    }),
    nitro({
      routeRules: { '/admin/**': { ssr: false } },
    }),
  ],
}));
```

Add `@analogjs/vite-plugin-angular` and `@analogjs/vite-plugin-nitro` to the app's `devDependencies`:

```json
{
  "devDependencies": {
    "@analogjs/platform": "...",
    "@analogjs/vite-plugin-angular": "...",
    "@analogjs/vite-plugin-nitro": "..."
  }
}
```

#### Options that moved off `analog()`

These options used to live on `analog()`. Pass them to `angular()` or `nitro()` directly:

| v2 location                                                                                                                                      | v3 location                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `analog({ vite: {...} })`                                                                                                                        | spread directly into `angular({...})`                                                                 |
| `analog({ jit })`, `disableTypeChecking`, `liveReload`, `inlineStylesExtension`, `fileReplacements`, `fastCompile`, `fastCompileMode`, `include` | `angular({...})`                                                                                      |
| `analog({ experimental: { useAngularCompilationAPI: true } })`                                                                                   | `angularCompilationPlugin()`                                                                          |
| `analog({ experimental: { stylePipeline: { angularPlugins: [...] } } })`                                                                         | a Vite plugin exposing `analog.setup()` (see the [Style Pipeline guide](/docs/guides/style-pipeline)) |
| `analog({ nitro: {...} })`                                                                                                                       | `nitro({...})`                                                                                        |
| `analog({ vite: false })`                                                                                                                        | drop `angular()` from the plugins array                                                               |

`analog()` retains `ssr`, `static`, `apiPrefix`, `entryServer`, `index`, `workspaceRoot`, `content`, `prerender`, `i18n`, `additionalPagesDirs`/`additionalContentDirs`/`additionalAPIDirs`, `debug`, and `experimental.typedRouting`.

#### Workspace library globs

The `discoverRoutes` option was removed. If your v2 config used `discoverRoutes: true` to compile workspace library pages, use the `discoverLibraryRoutes()` helper exported from `@analogjs/platform` instead. Call it once and feed the result to `analog()`. The platform registers the library page globs with Angular compilation through `analog.setup()`, so `angular()` needs no matching `include`:

```ts
import analog, { discoverLibraryRoutes } from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';

const libs = discoverLibraryRoutes(resolve(__dirname, '../..'));

plugins: [
  analog({
    additionalPagesDirs: libs.additionalPagesDirs,
    additionalContentDirs: libs.additionalContentDirs,
    additionalAPIDirs: libs.additionalAPIDirs,
  }),
  angular(),
  nitro(),
];
```

#### Using Nitro v3

To run on Nitro v3, import `nitro()` from `nitro/vite` instead. Analog detects it and configures Nitro v3 for SSR, prerendering, API routes, page endpoints, and server functions. The config passed to `nitro()` stays the same:

```ts
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';

plugins: [
  analog(),
  angular(),
  nitro({
    routeRules: { '/admin/**': { ssr: false } },
  }),
];
```

Add `nitro` to the app's `devDependencies` instead of `@analogjs/vite-plugin-nitro`. API routes and middleware are written against the h3 version of the Nitro release in use: h3 v1 for Nitro v2 and h3 v2 for Nitro v3. Handlers that only use helpers available in both, such as `defineEventHandler`, `readBody`, `getQuery`, and `getCookie`, work on either.

##### Nx build target

If your app uses `@nx/vite:build` with Nitro v3, switch it to `nx:run-commands` invoking `vite build`. `@nx/vite:build` iterates `builder.environments` but doesn't call `builder.buildApp()` — and `nitro/vite`'s prerender + final Nitro env build orchestration lives in the `buildApp` hook. Without the CLI's `buildApp` invocation, no prerender runs and the SSR/Nitro env outputs are skipped.

Before (`apps/<app>/project.json`):

```json
{
  "build": {
    "executor": "@nx/vite:build",
    "outputs": [
      "{options.outputPath}",
      "{workspaceRoot}/dist/apps/<app>/.nitro",
      "{workspaceRoot}/dist/apps/<app>/ssr",
      "{workspaceRoot}/dist/apps/<app>/analog"
    ],
    "options": {
      "configFile": "apps/<app>/vite.config.ts",
      "outputPath": "dist/apps/<app>/client"
    }
  }
}
```

After:

```json
{
  "build": {
    "executor": "nx:run-commands",
    "outputs": ["{workspaceRoot}/apps/<app>/.output"],
    "options": {
      "command": "vite build -c apps/<app>/vite.config.ts"
    }
  }
}
```

Also drop the top-level `build.outDir` override in `vite.config.ts`, and add `server.fs.allow` pointing at the workspace root so Vite 8's strict fs allows nitro/vite's env runner to load its own dev runtime through pnpm content-hash paths. Under `nitro/vite`, the client environment's output is relocated to `<rootDir>/.output/public` by Nitro; the legacy `dist/apps/<app>/client` override no longer matches the active output path.

### Content rendering now requires an explicit highlighter

If your app renders markdown content, configure the content highlighter through the `analog()` plugin in `vite.config.ts`. New blog templates already do this, but older full-stack apps often do not.

Before:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(() => ({
  plugins: [analog()],
}));
```

After:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(() => ({
  plugins: [
    analog({
      content: {
        highlighter: 'shiki',
      },
    }),
  ],
}));
```

If you are using the markdown renderer in the app itself, keep `provideContent(withMarkdownRenderer())`.

The `withShikiHighlighter()` and `withPrismHighlighter()` providers and the `@analogjs/content/shiki-highlighter` and `@analogjs/content/prism-highlighter` entry points were removed. They were no-ops, since highlighting happens at build time through the `analog()` content options. Remove them from `provideContent()`:

```diff-ts
- import { withShikiHighlighter } from '@analogjs/content/shiki-highlighter';

export const appConfig: ApplicationConfig = {
  providers: [
-   provideContent(withMarkdownRenderer(), withShikiHighlighter()),
+   provideContent(withMarkdownRenderer()),
  ],
};
```

The `MarkedContentHighlighter` class and `withHighlighter()` provider were also removed from `@analogjs/content`, along with its `marked` and `marked-highlight` peer dependencies. Nothing in the browser used them after highlighting moved to build time; configure highlighting with the `analog()` content options instead.

If you used `withPrismHighlighter()` for Prism's toolbar and copy-to-clipboard plugins in the browser, import them directly in `app.config.ts` instead:

```ts
import 'prismjs';
import 'prismjs/plugins/toolbar/prism-toolbar';
import 'prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard';
```

If you were relying on older internal imports, switch those to the public `@analogjs/content` entrypoint. For example, import `ContentRenderer` and `TableOfContentItem` from `@analogjs/content`, not `@analogjs/content/lib`.

```ts
import { ContentRenderer, type TableOfContentItem } from '@analogjs/content';
```

### Content routes now require `withContentRoutes()`

If your v2 app uses markdown page routes such as `.md` files in `src/app/pages`, update the router setup to opt into content routes explicitly.

Before:

```ts
import { provideFileRouter } from '@analogjs/router';

provideFileRouter();
```

After:

```ts
import { provideFileRouter } from '@analogjs/router';
import { withContentRoutes } from '@analogjs/router/content';

provideFileRouter(withContentRoutes());
```

If you moved any content-route helpers into app code, import them from `@analogjs/router/content` instead of relying on the older `@analogjs/router` layout.

### `FormAction` enhanced form handling is now the default

The `FormAction` directive from `@analogjs/router` now defaults `enhanceForm` to `true`. The directive matches `form[action]` and `form[method]`, so every such form in a component that imports `FormAction` switches to [enhanced form handling](/docs/guides/forms#enhanced-forms). This includes the `action` destination, the `data-state` and `aria-busy` attributes, and the enhanced GET query and redirect handling.

To keep the v2 behavior for a form, set `[enhanceForm]="false"`:

```html
<form method="post" [enhanceForm]="false">
  <!-- ... -->
</form>
```

### Astro Angular now targets Angular 20 zoneless change detection

If you use `@analogjs/astro-angular`, plan the upgrade around Angular 20 and its zoneless baseline. Treat that package as a separate migration stream from a standard Analog app upgrade.

### Astro Angular hydration and style placement are on by default

`@analogjs/astro-angular` now enables `useAngularHydration` and `strictStylePlacement` by default.

- Components hydrate with Angular's `provideClientHydration` instead of being bootstrapped on the client to replace the server-rendered DOM. Add `ngSkipHydration` to components that don't support hydration, or set `useAngularHydration: false` to keep the previous behavior.
- Component style tags are added to the document head. This disables Astro's SSR streaming. If your app relies on streaming, set `strictStylePlacement: false`.

```js
export default defineConfig({
  integrations: [
    angular({ useAngularHydration: false, strictStylePlacement: false }),
  ],
});
```

### Legacy Vitest setup path

If your tests still import `@analogjs/vite-plugin-angular/setup-vitest`, migrate them to `@analogjs/vitest-angular/setup-zone`. Current update flows cover this automatically, but older manual setups should be checked explicitly.

### Storybook testing imports

If your test setup already imports `setProjectAnnotations` from `@analogjs/storybook-angular/testing`, that entrypoint remains available in v3. Keep using it, and align the rest of the setup with the current Storybook Vitest docs if needed.

### Custom base-href deployment flow

If your app is deployed under a custom base URL, re-check that setup against the current deployment docs. The older pattern that relied on hand-editing `apiPrefix`, `injectAPIPrefix()`, and preview commands around the old flow is not the current recommended setup.

In the v3 line, deployment docs emphasize:

- setting `APP_BASE_HREF` from `import.meta.env.BASE_URL`
- passing the build-time base href explicitly in the build command
- setting `NITRO_APP_BASE_URL` in the runtime container for the deployed prefix

### `requestContextInterceptor` is registered by `provideFileRouter()`

`provideFileRouter()` now registers `requestContextInterceptor` for `HttpClient`, so a plain `provideHttpClient()` resolves relative URLs during SSR and prerendering and reuses SSR responses on the client. `ng update` removes the manual registration from `withInterceptors([...])`, along with `withInterceptors()` when it has no other interceptors.

Before:

```ts
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideFileRouter, requestContextInterceptor } from '@analogjs/router';

providers: [
  provideFileRouter(),
  provideHttpClient(withFetch(), withInterceptors([requestContextInterceptor])),
];
```

After:

```ts
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideFileRouter } from '@analogjs/router';

providers: [provideFileRouter(), provideHttpClient(withFetch())];
```

The interceptor runs after any interceptors you register with `withInterceptors()`.

### `VITE_ANALOG_PUBLIC_BASE_URL` was removed

Server-side data fetching no longer reads `VITE_ANALOG_PUBLIC_BASE_URL`. Delete it from your `.env` files and CI builds. Page `load` resolvers no longer switch to `globalThis.$fetch` when the variable is set, which bypassed the `HttpClient` transfer cache and caused SSR data to be fetched again on the client.

Make sure your server entry uses `provideServerContext()` and your app uses `provideFileRouter()`, which registers `requestContextInterceptor`, as described in [Server Request Context](/docs/features/data-fetching/overview#server-request-context). The base URL is then derived from each incoming request. If your data fetching must call a different origin than the one serving the app, provide the `BASE_URL` token from `@analogjs/router/tokens` yourself in `app.config.server.ts`.

### The `useAPIMiddleware` option was removed

The deprecated `useAPIMiddleware` option, the generated `/api` proxy middleware it enabled, and the `routeRules` proxy fallback are removed from both `@analogjs/vite-plugin-nitro` and the Nitro v3 integration. API routes are served exclusively through Nitro's native file-based routing under `src/server/routes/api`.

If your app has a `src/server/routes/api` directory, no change is needed — that is the default scaffold layout and the intended approach. Only apps that removed that directory and relied on `useAPIMiddleware` (or its `routeRules` proxy fallback) are affected: move your API handlers into `src/server/routes/api` and drop the `useAPIMiddleware` option from your config. Page endpoints (`.server.ts` files) for those apps are also now served under the API prefix (`/api/_analog/pages`) instead of `/_analog/pages`.

### Deprecated router APIs were removed

`@analogjs/router` no longer exports `defineRouteMeta`, `injectRouter`, `injectActivatedRoute`, or `routes`. `ng update` rewrites the first three automatically. Files that reference them without calling them, such as `useFactory: injectRouter`, are listed for manual migration and left unchanged, so update every use in those files by hand.

Before:

```ts
import { defineRouteMeta, injectRouter } from '@analogjs/router';

export const routeMeta = defineRouteMeta({ title: 'Home' });

export default class HomePage {
  router = injectRouter();
}
```

After:

```ts
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = { title: 'Home' };

export default class HomePage {
  router = inject(Router);
}
```

Replace `injectActivatedRoute()` with `inject(ActivatedRoute)`. If you passed `routes` to `provideRouter()`, use `provideFileRouter()` instead.

### Legacy `app/routes` page folders were removed

Route discovery no longer reads `app/routes/**/*.ts`, `src/app/routes/**/*.ts`, or `src/app/routes/**/*.md`. Move those files to `src/app/pages`, renaming `.ts` route files to `.page.ts`. Markdown files in `src/app/pages` and `src/content` are unchanged.

### The `setupTestBed` `browserMode` option was removed

`setupTestBed({ browserMode })` from `@analogjs/vitest-angular/setup-testbed` is removed. Use the `teardown` option instead. `ng update` rewrites this automatically.

```ts
// Before
setupTestBed({ browserMode: true });

// After
setupTestBed({ teardown: { destroyAfterEach: false } });
```

The `@analogjs/vitest-angular:setup` schematic's `--browserMode` flag still configures browser mode and now generates the `teardown` option.

### Vitest builder aliases and the `setup-vitest` generator were removed

The following builder and executor aliases are removed. `ng update` replaces them with `@analogjs/vitest-angular:test` in `angular.json`, `project.json`, and `nx.json`, and adds `@analogjs/vitest-angular` to `devDependencies` if needed.

- `@analogjs/vite-plugin-angular:vitest`
- `@analogjs/platform:vitest`
- `@analogjs/storybook-angular:test-storybook`

The `@analogjs/platform:setup-vitest` generator is also removed. Use `ng g @analogjs/vitest-angular:setup` instead.

### Content renderer APIs were removed

`ContentRenderer.getContentHeadings()` is removed. Read the table of contents from `render().toc` or `ContentFile.toc` instead. Custom `ContentRenderer` implementations should return `toc` from `render()`.

`MERMAID_IMPORT_TOKEN` is no longer exported from `@analogjs/content`. Enable Mermaid with `withMarkdownRenderer({ loadMermaid })`:

```ts
provideContent(withMarkdownRenderer({ loadMermaid: () => import('mermaid') }));
```

### `defineServerRoute` was replaced by `defineApiRoute`

`defineServerRoute` from `@analogjs/router/server/actions` is removed. `defineApiRoute` accepts the same options, has the same validation and response behavior, and returns a route typed for `InferRouteQuery`, `InferRouteBody`, `InferRouteResult`, and the TanStack Query integration. Rename the import and the call:

```diff
-import { defineServerRoute } from '@analogjs/router/server/actions';
+import { defineApiRoute } from '@analogjs/router/server/actions';

-export const route = defineServerRoute({
+export const route = defineApiRoute({
```

The `DefineServerRouteContext`, `DefineServerRouteOptions`, `DefineServerRouteResult`, and `ServerRouteHandler` types are now `DefineApiRouteContext`, `DefineApiRouteOptions`, `DefineApiRouteResult`, and `ApiRouteHandler`.

### Removed no-op options

These options had no effect and were removed. Delete them from your config:

- `analog({ discoverRoutes })`: use [`discoverLibraryRoutes()`](#workspace-library-globs) to include routes from workspace libraries.
- `angular({ supportedBrowsers })`: no replacement is needed.

### Removed first-party packages and current compiler gaps

If your app depends on `@analogjs/trpc`, plan that migration separately. The first-party package is removed in v3, so you need to replace it with standard Analog server and API routes or maintain a custom tRPC integration outside the removed package.

If you enabled the experimental Analog Compiler in v2 with `experimental.useAnalogCompiler`, `analogCompilationMode`, or a direct `@analogjs/angular-compiler` dependency, treat that path as not yet ported to the current v3 alpha line. Do not represent it as a stable v3 migration target yet. Use the standard `@analogjs/vite-plugin-angular` path for the v3 alpha migration itself, and treat `angularCompilationPlugin()` as a separate experimental opt-in evaluation rather than a drop-in replacement. Its API and behavior may change in future releases.

### Template and toolchain baseline shifts

Do not assume your v2 workspace can keep the same Node and tooling floor. The `beta -> alpha` template diff shows these practical shifts:

- current templates now require Node `^22.18.0 || ^24.3.0`
- current templates pin TypeScript `6.0.2`
- current templates use `vite-tsconfig-paths` `^6.1.1`
- content-enabled templates now pin `marked` `^17.0.5`

Match the current template line for your Angular major instead of assuming one repo-wide Vite target.

## Notes for automated migration

Keep automated migration tooling focused on the breaking changes above:

- require Angular v20 or newer before applying v3 changes
- replace deep or internal imports with public package entrypoints
- split `analog()` into `analog() + angular() + nitro()`, moving each option to the plugin that now owns it (see [plugin separation](#analog-angular-and-nitro-are-now-separate-plugins))
- import `nitro()` from `@analogjs/vite-plugin-nitro` and move `analog({ nitro: {...} })` to its argument
- add `@analogjs/vite-plugin-angular` and `@analogjs/vite-plugin-nitro` to app `devDependencies` (the separated shape imports them directly)
- leave apps already using `nitro()` from `nitro/vite` on Nitro v3
- add explicit `analog({ content: { highlighter: 'shiki' } })` config when the app renders markdown content
- remove `withShikiHighlighter()` / `withPrismHighlighter()` and their `@analogjs/content/*-highlighter` imports
- add `withContentRoutes()` from `@analogjs/router/content` when the app uses markdown page routes
- remove `requestContextInterceptor` from `withInterceptors([...])`, since `provideFileRouter()` registers it
- rewrite only the legacy `@analogjs/vite-plugin-angular/setup-vitest` setup import
- replace `defineRouteMeta(...)` with a `RouteMeta`-typed object, and `injectRouter()` / `injectActivatedRoute()` with `inject(Router)` / `inject(ActivatedRoute)`
- replace `setupTestBed({ browserMode })` with `teardown: { destroyAfterEach }`
- replace the `@analogjs/vite-plugin-angular:vitest`, `@analogjs/platform:vitest`, and `@analogjs/storybook-angular:test-storybook` builders with `@analogjs/vitest-angular:test`
- flag route files under `app/routes` or `src/app/routes`, `routes` imports, `ContentRenderer.getContentHeadings()`, and `MERMAID_IMPORT_TOKEN` for manual migration
- flag forms using `FormAction` that rely on the v2 non-enhanced behavior; add `[enhanceForm]="false"` to keep it
- rename `defineServerRoute` to `defineApiRoute` and `ServerRouteHandler` to `ApiRouteHandler` in `@analogjs/router/server/actions` imports
- remove `analog({ discoverRoutes })` and `angular({ supportedBrowsers })`, which had no effect
- flag `@analogjs/trpc` as a removed package that needs a manual migration plan
- flag `experimental.useAnalogCompiler`, `analogCompilationMode`, and `@analogjs/angular-compiler` as unsupported on the current v3 alpha line rather than removed outright
- typed routing keeps the beta `experimental.typedRouting`, `toRoute`, and `LinkTo` APIs; see the [typed routing guide](/docs/features/routing/typed-routes) for migration from earlier v3 alphas
- treat `withDebugRoutes` and `liveReload` as opt-in rather than mandatory rewrites
