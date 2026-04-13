import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Updating to the latest version

You can use the `ng update` command for an Angular CLI workspace, or the `nx migrate` command for updating within an Nx workspace.

After updating, review the current [Deprecations and Compatibility](/docs/guides/deprecations) guide so compatibility aliases do not become your new baseline API usage.

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
