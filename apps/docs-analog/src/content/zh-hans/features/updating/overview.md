import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 更新到最新版本

用 Angular CLI 的项目可以执行 `ng update` 命令，或者用 Nx 的项目可以执行 `nx migrate` 命令。

<Tabs groupId="app-upgrader">
  <TabItem label="ng update" value="ng-update">

### ng update

执行 `ng update` 命令来更新 Analog 项目：

```shell
ng update @analogjs/platform@latest
```

</TabItem>

  <TabItem label="Nx migrate" value="nx-migrate">

### Nx Migrate

执行 `nx migrate` 命令来更新 Analog 项目：

```shell
nx migrate @analogjs/platform@latest
```

</TabItem>
</Tabs>
