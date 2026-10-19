import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migrating from Analog v1 to v2

Upgrade the workspace to the current Analog v2 line first, then continue with the v3 guide.

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

Keep content rendering, markdown helpers, and table-of-contents usage on the public API surface before moving on to v3.

## Continue to v3

Once the app is on the current v2 line and using public imports, continue with the [Analog v2 to v3 migration guide](/docs/guides/migrating-v2-to-v3).
