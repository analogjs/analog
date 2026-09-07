# Migrating from Analog v1 to v2

This guide updates an existing Analog v1 application to the Analog v2 release line. To migrate a plain Angular application, use the [Angular application migration guide](/docs/guides/migrating).

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
import { ContentRenderer, type TableOfContentItem } from '@analogjs/content';
```

## Verify the migration

Review the generated dependency and source changes, install dependencies with your workspace's package manager, and run any generated migrations. For Nx workspaces, run `nx migrate --run-migrations` if the update created a `migrations.json` file.

Build and test your application, including server rendering and content pages. Keep content rendering, markdown helpers, and table-of-contents usage on the public package entrypoints.
