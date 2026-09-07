# Migrating from Analog v1 to v2

This guide updates an existing Analog v1 application to the Analog v2 release line. To migrate a plain Angular application, use the [Angular application migration guide](/docs/guides/migrating).

## Check prerequisites

Analog v2 requires Angular 17 or newer and Vite 6 or newer. Upgrade Angular 16 applications before updating Analog, and use the Node.js and TypeScript versions supported by your chosen Angular version. Keep the Angular packages in your workspace on matching versions.

For `@analogjs/astro-angular`, Angular 20 or newer is required. The integration enables zoneless change detection for both server rendering and browser hydration. Components should notify Angular of updates through signals, template event listeners, the async pipe, or `ChangeDetectorRef.markForCheck()`. Check asynchronous updates that previously relied on Zone.js, and remove `zone.js` imports from the Astro integration's bootstrap setup.

## Update the workspace packages

Use the standard Analog update flow for your workspace type, but target the v2 major:

<Tabs groupId="app-upgrader">
  <TabItem label="ng update" value="ng-update">

```shell
ng update @analogjs/platform@2
```

  </TabItem>

  <TabItem label="Nx migrate" value="nx-migrate">

```shell
nx migrate @analogjs/platform@2
```

  </TabItem>
</Tabs>

## Replace internal content imports

If your app imports from internal paths such as `@analogjs/content/lib`, switch those imports to the public `@analogjs/content` entrypoint.

```ts
import { ContentRenderer } from '@analogjs/content';

type TableOfContentItem = ReturnType<
  ContentRenderer['getContentHeadings']
>[number];
```

The v2 package does not export `TableOfContentItem` by name. If you need that type, derive it from the public renderer method as shown above instead of importing an internal file.

## Configure content highlighting

If your application uses content rendering with syntax highlighting, configure the content package in the `analog` Vite plugin as well as the application's providers. In v2, the package is externalized unless content support is configured.

For an existing Prism setup, replace `analog()` with:

```ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    analog({
      content: {
        highlighter: 'prism',
      },
    }),
  ],
});
```

Keep your other Vite options and application providers. The application should register `provideContent(withMarkdownRenderer(), withPrismHighlighter())`, importing `provideContent` and `withMarkdownRenderer` from `@analogjs/content` and `withPrismHighlighter` from `@analogjs/content/prism-highlighter`. See [content routes](/docs/features/routing/content) for the corresponding stylesheet and Shiki configuration.

## Verify the migration

Review the generated dependency and source changes, install dependencies with your workspace's package manager, and run any generated migrations. For Nx workspaces, run `nx migrate --run-migrations` if the update created a `migrations.json` file.

Build and test your application, including server rendering, content highlighting, and table-of-contents navigation. For Astro integrations, also test hydration and asynchronous component updates. Keep content rendering and markdown helpers on the public package entrypoints.
