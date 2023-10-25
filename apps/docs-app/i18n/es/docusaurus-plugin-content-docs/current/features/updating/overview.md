import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Actualizando a la última versión

Puedes usar el comando `ng update` para un workspace de Angular CLI, o el comando `nx migrate` para actualizar dentro de un workspace de Nx.

<Tabs groupId="app-upgrader">
  <TabItem label="ng update" value="ng-update">

### ng update

Para actualizar un proyecto Analog con el comando `ng update`:

```shell
ng update @analogjs/platform@latest
```

</TabItem>

  <TabItem label="Nx" value="nx-migrate">

### Nx Migrate

Para actualizar un proyecto Analog con el comando `nx migrate`:

```shell
nx migrate @analogjs/platform@latest
```

</TabItem>
</Tabs>
