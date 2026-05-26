import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Generación de código

Analog soporta la generación de código automatizada usando Nx Generators y Angular Schematics.

<Tabs groupId="project-type">
  <TabItem value="Nx">

### Generadores

El plugin de Analog para Nx provee una serie de generadores que ayudan a automatizar algunas de las tareas frecuentes dentro de un proyecto Analog, como generar una **Página**. Para usar estos generadores, la extensión **Nx Console** puede ser instalada o pueden ser invocados manualmente usando:

### Generando una aplicación

Para generar una nueva aplicación Analog con el espacio de trabajo de Nx, usar el generador de aplicación:

```shell
npx nx generate @analogjs/platform:page --pathname=index --project=analog-app
```

### Generando páginas

```shell
npx nx generate @analogjs/platform:page --pathname=index --project=analog-app
```

También funciona con los nombres específicos de Analog, **Nota: estos nombres deben estar rodeados por comillas simples** ejemplo:

```shell
npx nx generate @analogjs/platform:page --pathname='(blog)' --project=analog-app
```

el schematic también acepta subdirectorios para estructurar nuestro proyecto de manera adecuada.

```shell
npx nx generate @analogjs/platform:page --pathname='products/[products]' --project=analog-app
```

  </TabItem>

  <TabItem label="Schematics" value="schematics">

### Angular Schematics

Analog provee una serie de esquemas que ayudan a automatizar algunas tareas frecuentes en el espacio de trabajo de Angular CLI, como generar una **applicación** o una **página**. Para usar estos esquemnas, utilizar el comando generate:

### Generando una aplicación

Para generar una nueva aplicación Analog con un espacio de trabrabajo Angular CLI, usar el esquema de application:

```shell
npx ng generate @analogjs/platform:application my-app
```

### Generando páginas

```shell
npx ng g @analogjs/platform:page --pathname=index --project=/
```

También funciona con nombres de archivos especificos , **Nota: estos nombres tienen que ser rodeados con comillas simples** por ejemplo:

```shell
npx ng g @analogjs/platform:page --pathname='(blog)' --project=/
```

El esquema también acepta sub directorios para estructurar tu proyecto adecuadamente.

```shell
npx ng g @analogjs/platform:page --pathname='products/[products]' --project=/
```

  </TabItem>
</Tabs>
