---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Nx

## Resumen

[Nx](https://nx.dev) es un sistema de compilación inteligente, rápido y extensible con soporte de primer nivel para monorrepositorios e integraciones potentes.

Analog ofrece integración con monorrepositorios y espacios de trabajo Nx a través de un preajuste de espacio de trabajo y un generador de aplicaciones. Una aplicación Analog se puede crear como un proyecto autónomo o agregarse a un espacio de trabajo Nx existente.

## Creando un proyecto Nx autónomo

Para crear un proyecto Nx independiente, usa el comando `create-nx-workspace` con el preajuste `@analogjs/platform`.

Crea un nuevo espacio de trabajo Nx con una aplicación Analog preconfigurada:

```shell
npx create-nx-workspace@latest --preset=@analogjs/platform
```

El preajuste de Analog te pide que proporciones el nombre de tu aplicación. En este ejemplo, simplemente usamos `analog-app`.
Adicionalmente, pregunta si te gustaría incluir [TailwindCSS](https://tailwindcss.com) y [tRPC](https://trpc.io)en tu nuevo proyecto.
Si eliges incluir cualquiera de ellos, todas las dependencias requeridas se instalan automáticamente, y se agregan las configuraciones necesarias.

### Ejecutando la aplicación

Para iniciar el servidor de desarrollo para tu aplicación, ejecuta el comando `nx serve`.

```shell
npx nx serve analog-app
```

Abre `http://localhost:4200` en tu navegador para ver la aplicación en funcionamiento.

### Compilando la aplicación

Para compilar la aplicación para su despliegue, ejecuta:

```shell
npx nx build analog-app
```

### Artefactos de compilación

Los artefactos de compilación del cliente se ubican en el directorio `dist` de tu espacio de trabajo Nx.

En el diseño de espacio de trabajo independiente, los artefactos del cliente de `analog-app` se encuentran en el directorio `dist/analog/public`.
El servidor para los artefactos de compilación de la API/SSR se encuentra en el directorio `dist/analog/server`.

## Agregar a un espacio de trabajo Nx existente

Una aplicación Analog se puede generar dentro de un espacio de trabajo Nx existente. Para generar una aplicación:

Primero, instala el paquete `@analogjs/platform`:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/platform --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/platform --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/platform --save-dev
```

  </TabItem>
</Tabs>

Luego, usa el generador de aplicaciones para crear una nueva aplicación:

```shell
npx nx g @analogjs/platform:app analog-app
```
