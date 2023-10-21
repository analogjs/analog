import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Generación de código

Analog soporta la generación de código automatizada usando Nx Generators y Angular Schematics.

## Generar una Página

Este comando genera una página dentro de nuestra carpeta `pages` con una configuración mínima.

<Tabs groupId="project-type">
  <TabItem value="Nx">

### Generadores

El plugin de Analog para Nx provee una serie de generadores que ayudan a automatizar algunas de las tareas frecuentes dentro de un proyecto Analog, como generar una **Página**. Para usar estos generadores, la extensión **Nx Console** puede ser instalada o pueden ser invocados manualmente usando:

```shell
npx nx generate @analogjs/platform:page --pathname=index --project=analog-app
```

También funciona con los nombres específicos de Analog, **Nota: estos nombres deben estar rodeados por comillas simples** ej:

```shell
npx nx generate @analogjs/platform:page --pathname='(blog)' --project=analog-app
```

el schematic también acepta subcarpetas para estructurar nuestro proyecto de manera adecuada.

```shell
npx nx generate @analogjs/platform:page --pathname='products/[products]' --project=analog-app
```

  </TabItem>

  <TabItem label="Schematics" value="schematics">

### Angular Schematics

Analog provee una serie de schematics que ayudan a automatizar algunas de las tareas frecuentes dentro de un proyecto Analog, como generar una **Página**. Para usar estos schematics, use el comando generate:

```shell
ng g @analogjs/platform:page --pathname=index --project=/
```

it also works with the Analog specific filenames, **Note: this names needs to be surrounded by single quotes** ex:

```shell
ng g @analogjs/platform:page --pathname='(blog)' --project=/
```

The schematic as well accepts subfolders to structure our project properly.

```shell
ng g @analogjs/platform:page --pathname='products/[products]' --project=/
```

  </TabItem>
</Tabs>
