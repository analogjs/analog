import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# create-analog

El paquete `create-analog` contiene plantillas para generar nuevos proyectos de Analog.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm create analog@latest
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog
```

  </TabItem>
</Tabs>

### Flags Opcionales de `create-analog`

| Flag         | Descripción                                                                           | Tipo de Valor | Valor Predeterminado |
| ------------ | ------------------------------------------------------------------------------------- | ------------- | -------------------- |
| &lt;name&gt; | Nombre del proyecto. Especifica `.` para generar el proyecto en el directorio actual. | string        |                      |
| `--template` | Preset de plantilla.                                                                  | string        |                      |

### Presets de Plantillas

| Preset                   | Descripción                                               |
| ------------------------ | --------------------------------------------------------- |
| `Full-stack Application` | Aplicación predeterminada de Analog.                      |
| `Blog`                   | Plantilla predeterminada mejorada con un ejemplo de blog. |

### Ejemplo

Para generar una aplicación Angular en el directorio `my-angular-app`, ejecuta:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
# npm >=7.0
npm create analog@latest my-angular-app -- --template latest
# npm 6.x
npm create analog@latest my-angular-app -- --template blog
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog my-angular-app --template blog
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog my-angular-app --template blog
```

  </TabItem>
</Tabs>
