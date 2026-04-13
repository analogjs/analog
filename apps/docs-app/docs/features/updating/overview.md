import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Updating to the latest version

You can use the `ng update` command for an Angular CLI workspace, or the `nx migrate` command for updating within an Nx workspace.

If you are upgrading an existing Analog app between major versions, use the dedicated guides:

- [Migrating from Analog v1 to v2](/docs/guides/migrating-v1-to-v2)
- [Migrating from Analog v2 to v3](/docs/guides/migrating-v2-to-v3)

<Tabs groupId="app-upgrader">
  <TabItem label="ng update" value="ng-update">

### ng update

To update an Analog project with the `ng update` command:

```shell
ng update @analogjs/platform@latest
```

</TabItem>

  <TabItem label="Nx migrate" value="nx-migrate">

### Nx Migrate

To update an Analog project with the `nx migrate` command:

```shell
nx migrate @analogjs/platform@latest
```

</TabItem>
</Tabs>
