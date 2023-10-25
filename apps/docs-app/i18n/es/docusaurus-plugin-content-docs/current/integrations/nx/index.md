---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Nx

## Descripción General

[Nx](https://nx.dev) es un sistema de construcción inteligente, rápido y extensible con soporte de monorepos de primera clase e integraciones poderosas.

Analog provee integración con monorepos y workspaces de Nx a través de un preset de workspace y un generador de aplicaciones. Una aplicación Analog puede ser creada como un proyecto independiente o añadida a un workspace existente de Nx.

## Creando un Proyecto Independiente de Nx

Para crear un proyecto independiente de Nx, usa el comando `create-nx-workspace` con el preset `@analogjs/platform`.

Crear un nuevo workspace de Nx con una aplicación Analog preconfigurada:

```shell
npx create-nx-workspace@latest --preset=@analogjs/platform
```

El preset Analog te pedirá que proporciones el nombre de tu aplicación. En este ejemplo, simplemente usamos `analog-app`.
Adicionalmente, pregunta si quieres incluir [TailwindCSS](https://tailwindcss.com) y [tRPC](https://trpc.io) en tu nuevo proyecto.
Si eliges incluir cualquiera de ellos, todas las dependencias requeridas son instaladas automáticamente,
y cualquier configuración necesaria es añadida.

### Sirviendo la aplicación

Para iniciar el servidor de desarrollo para tu aplicación, ejecuta el comando `nx serve`.

```shell
npx nx serve analog-app
```

Navega a `http://localhost:4200` en tu navegador para ver la aplicación ejecutándose.

### Construyendo la Aplicación

Para construir la aplicación para despliegue, ejecuta:

```shell
npx nx build analog-app
```

### Artefactos de Construcción

Los artefactos de construcción de la aplicación están localizados en la carpeta `dist` de tu workspace de Nx.

En el espacio de trabajo, los artefactos de construcción de la aplicación `analog-app` están localizados en la carpeta `dist/analog/public`.
El servidor para los artefactos de construcción de la API/SSR está localizado en la carpeta `dist/analog/server`.

## Agregando a un workspace de Nx existente

Una aplicación Analog puede ser generada dentro de un workspace de Nx existente. Para generar una aplicación:

Primeo, instala el paquete `@analogjs/platform`:

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

A continuación, usa el generador de aplicaciones para crear una nueva aplicación:

```shell
npx nx g @analogjs/platform:app analog-app
```

### Sirviendo la aplicación

Para iniciar el servidor de desarrollo para tu aplicación, ejecuta el comando `nx serve`.

```shell
npx nx serve analog-app
```

Navega a `http://localhost:4200` en tu navegador para ver la aplicación ejecutándose.

### Construyendo la Aplicación

Para construir la aplicación para despliegue, ejecuta:

```shell
npx nx build analog-app
```

### Artefactos de Construcción

Los artefactos de construcción de la aplicación están localizados en la carpeta `dist` de tu workspace de Nx.

En el espacio común de trabajo apps/libs, los artefactos de construcción de la aplicación `analog-app` están localizados en la carpeta `dist/apps/analog-app/analog/public`.
El servidor para los artefactos de construcción de la API/SSR está localizado en la carpeta `dist/apps/analog-app/analog/server`.
