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

Analog v3 no longer supports Angular v16. Upgrade the workspace to Angular v17 or newer before adopting the stable v3 line.

### Removed Analog SFC support

Analog SFC support was removed and `.agx` files are no longer supported. Replace any remaining SFC usage with standard Angular components, markdown content files, or route/page files that use the current Analog conventions.

### `analog()`, `angular()`, and `nitro()` are now separate plugins

Analog v3 splits the Vite plugin chain into three explicit calls. `analog()` no longer internally invokes `@analogjs/vite-plugin-angular` or `nitro/vite` — you call them yourself. Pass each plugin only the options it owns.

`@analogjs/platform` v3 owns its own Nitro orchestration via `nitro/vite` directly and no longer composes `@analogjs/vite-plugin-nitro` internally. `@analogjs/vite-plugin-nitro` continues to ship as a standalone package for projects that want to wire it themselves; users coming from a v2 `analog({ nitro: {...} })` shape should migrate to the separated shape below (analog + angular + nitro from `nitro/vite`).

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
import { nitro } from 'nitro/vite';

export default defineConfig(() => ({
  server: {
    // Vite 8's strict fs only allows reads under config.root; nitro/vite's
    // env-runner reaches pnpm content-hash paths at the workspace root
    // when loading its own dev runtime.
    fs: { allow: [resolve(__dirname, '../..')] },
  },
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

Add `@analogjs/vite-plugin-angular` and `nitro` to the app's `devDependencies`:

```json
{
  "devDependencies": {
    "@analogjs/platform": "...",
    "@analogjs/vite-plugin-angular": "...",
    "nitro": "..."
  }
}
```

#### Options that moved off `analog()`

These options used to live on `analog()`. Pass them to `angular()` or `nitro()` directly:

| v2 location                                                                                                                                      | v3 location                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `analog({ vite: {...} })`                                                                                                                        | spread directly into `angular({...})`                           |
| `analog({ jit })`, `disableTypeChecking`, `liveReload`, `inlineStylesExtension`, `fileReplacements`, `fastCompile`, `fastCompileMode`, `include` | `angular({...})`                                                |
| `analog({ tailwindCss: {...} })`                                                                                                                 | `angular({ tailwindCss: {...} })`                               |
| `analog({ experimental: { useAngularCompilationAPI: true } })`                                                                                   | `angular({ experimental: { useAngularCompilationAPI: true } })` |
| `analog({ experimental: { stylePipeline: { angularPlugins: [...] } } })`                                                                         | `angular({ stylePipeline: { plugins: [...] } })`                |
| `analog({ nitro: {...} })`                                                                                                                       | `nitro({...})` (first arg)                                      |
| `analog({ vite: false })`                                                                                                                        | drop `angular()` from the plugins array                         |

`analog()` retains `ssr`, `apiPrefix`, `entryServer`, `content`, `prerender`, `i18n`, `discoverRoutes`, `additionalPagesDirs`/`additionalContentDirs`/`additionalAPIDirs`, `debug`, and `experimental.typedRouter`/`experimental.stylePipeline`.

#### Workspace library globs

If your v2 config used `discoverRoutes: true` to compile workspace library pages, the same helper is now exported from `@analogjs/platform`. Call it once and feed the result to both `analog()` and `angular()`:

```ts
import analog, { discoverLibraryRoutes, pageGlobs } from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';

const libs = discoverLibraryRoutes(resolve(__dirname, '../..'));

plugins: [
  analog({
    additionalPagesDirs: libs.additionalPagesDirs,
    additionalContentDirs: libs.additionalContentDirs,
    additionalAPIDirs: libs.additionalAPIDirs,
  }),
  angular({
    include: pageGlobs(libs.additionalPagesDirs),
    additionalContentDirs: libs.additionalContentDirs,
  }),
  nitro({}),
];
```

#### Nx build target

If your app uses `@nx/vite:build`, switch it to `nx:run-commands` invoking `vite build`. `@nx/vite:build` iterates `builder.environments` but doesn't call `builder.buildApp()` — and `nitro/vite`'s prerender + final Nitro env build orchestration lives in the `buildApp` hook. Without the CLI's `buildApp` invocation, no prerender runs and the SSR/Nitro env outputs are skipped.

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

Also drop the top-level `build.outDir` override in `vite.config.ts`. Under `nitro/vite`, the client environment's output is relocated to `<rootDir>/.output/public` by Nitro; the legacy `dist/apps/<app>/client` override no longer matches the active output path.

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

If you are using the markdown renderer in the app itself, keep `provideContent(withMarkdownRenderer())` and pair it with the matching highlighter setup for your project, such as `withShikiHighlighter()`.

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

### Astro Angular now targets Angular 20 zoneless change detection

If you use `@analogjs/astro-angular`, plan the upgrade around Angular 20 and its zoneless baseline. Treat that package as a separate migration stream from a standard Analog app upgrade.

### Runtime i18n helpers were removed

The beta runtime i18n helpers are not available in v3. If your app uses `analog({ i18n: ... })`, `provideI18n()`, `injectSwitchLocale()`, `loadTranslationsRuntime()`, or content locale helpers such as `withLocale()`, remove that Analog-specific runtime i18n setup before upgrading.

Plan to keep locale routing and translation loading in your own app code, or migrate to Angular's standard i18n and `$localize` approach instead. There is no direct first-party Analog replacement for the removed runtime i18n layer in v3.

### Legacy Vitest setup path

If your tests still import `@analogjs/vite-plugin-angular/setup-vitest`, migrate them to `@analogjs/vitest-angular/setup-zone`. Current update flows cover this automatically, but older manual setups should be checked explicitly.

### Storybook testing imports

If your test setup already imports `setProjectAnnotations` from `@analogjs/storybook-angular/testing`, that entrypoint remains available in v3. Keep using it, and align the rest of the setup with the current Storybook Vitest docs if needed.

### Custom base-href deployment flow

If your app is deployed under a custom base URL, re-check that setup against the current deployment docs. The older pattern that relied on hand-editing `apiPrefix`, `injectAPIPrefix()`, and preview commands around the old flow is not the current recommended setup.

In the v3 line, deployment docs emphasize:

- setting `APP_BASE_HREF` from `import.meta.env.BASE_URL`
- passing the build-time base href explicitly in the build command
- setting `VITE_ANALOG_PUBLIC_BASE_URL` during CI builds for server-side data fetching
- setting `NITRO_APP_BASE_URL` in the runtime container for the deployed prefix

### Removed first-party packages and current compiler gaps

If your app depends on `@analogjs/trpc`, plan that migration separately. The first-party package is removed in v3, so you need to replace it with standard Analog server and API routes or maintain a custom tRPC integration outside the removed package.

If you enabled the experimental Analog Compiler in v2 with `experimental.useAnalogCompiler`, `analogCompilationMode`, or a direct `@analogjs/angular-compiler` dependency, treat that path as not yet ported to the current v3 alpha line. Do not represent it as a stable v3 migration target yet. Use the standard `@analogjs/vite-plugin-angular` path for the v3 alpha migration itself, and treat `experimental.useAngularCompilationAPI` as a separate opt-in evaluation rather than a drop-in replacement.

### Template and toolchain baseline shifts

Do not assume your v2 workspace can keep the same Node and tooling floor. The `beta -> alpha` template diff shows these practical shifts:

- current templates now require Node `^22.18.0 || ^24.3.0`
- current templates pin TypeScript `6.0.2`
- current templates use `vite-tsconfig-paths` `^7.0.0-alpha.1`
- content-enabled templates now pin `marked` `^17.0.5`

Match the current template line for your Angular major instead of assuming one repo-wide Vite target.

## Notes for automated migration

Keep automated migration tooling focused on the breaking changes above:

- require Angular v17 or newer before applying v3 changes
- replace deep or internal imports with public package entrypoints
- split `analog()` into `analog() + angular() + nitro()`, moving each option to the plugin that now owns it (see [plugin separation](#analog-angular-and-nitro-are-now-separate-plugins))
- @analogjs/platform no longer composes @analogjs/vite-plugin-nitro internally; direct importers can either migrate to `@analogjs/platform` + `nitro/vite` (recommended) or continue using @analogjs/vite-plugin-nitro standalone
- add `@analogjs/vite-plugin-angular` and `nitro` to app `devDependencies` (the separated shape imports them directly)
- replace `@nx/vite:build` with `nx:run-commands` invoking `vite build -c apps/<app>/vite.config.ts`; drop the legacy `build.outDir` override and update `outputs` to `apps/<app>/.output`
- add `server.fs.allow` pointing at the workspace root in `vite.config.ts` so Vite 8's strict fs allows nitro/vite's env runner to load its own dev runtime through pnpm content-hash paths
- add explicit `analog({ content: { highlighter: 'shiki' } })` config when the app renders markdown content
- add `withContentRoutes()` from `@analogjs/router/content` when the app uses markdown page routes
- flag `analog({ i18n: ... })`, `provideI18n()`, `injectSwitchLocale()`, `loadTranslationsRuntime()`, or content locale helpers as removed v3 APIs
- rewrite only the legacy `@analogjs/vite-plugin-angular/setup-vitest` setup import
- flag `@analogjs/trpc` as a removed package that needs a manual migration plan
- flag `experimental.useAnalogCompiler`, `analogCompilationMode`, and `@analogjs/angular-compiler` as unsupported on the current v3 alpha line rather than removed outright
- treat optional helpers such as `withTypedRouter`, `withRouteContext`, `withLoaderCaching`, `withDebugRoutes`, and `liveReload` as opt-in rather than mandatory rewrites
