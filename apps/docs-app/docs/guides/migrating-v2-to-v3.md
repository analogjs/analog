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

### Astro Angular now targets Angular 20 zoneless change detection

If you use `@analogjs/astro-angular`, plan the upgrade around Angular 20 and its zoneless baseline. Treat that package as a separate migration stream from a standard Analog app upgrade.

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

### Template and toolchain baseline shifts

Do not assume the latest scaffolded app uses the same Angular and Vite versions as your v2 codebase. The `beta -> alpha` diff shows the template line moving to newer combinations, including:

- Angular 17 and 18 templates moving to Vite 6
- current full-stack/blog templates moving to Angular 19 plus Vite 7
- `@angular-devkit/build-angular` returning to the scaffolded devDependencies in the current templates
- markdown-related packages such as `marked`, `marked-highlight`, `marked-gfm-heading-id`, `marked-mangle`, `front-matter`, and sometimes `prismjs` being explicit app dependencies in current content-enabled templates

## Notes for automated migration

Keep automated migration tooling focused on the breaking changes above:

- require Angular v17 or newer before applying v3 changes
- replace deep or internal imports with public package entrypoints
- add explicit `analog({ content: { highlighter: 'shiki' } })` config when the app renders markdown content
- rewrite only the legacy `@analogjs/vite-plugin-angular/setup-vitest` setup import
- treat optional helpers such as `withTypedRouter`, `withRouteContext`, `withLoaderCaching`, `withDebugRoutes`, and compatibility aliases such as `liveReload` as opt-in rather than mandatory rewrites
