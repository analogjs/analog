---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Comenzando

## Requisitos del sistema

Analog requiere las siguientes versiones de Node y Angular:

- Node 16.17.0, o v18.13.0 y superior es recomendado
- Angular v15 o superior

## Creando una nueva aplicación

Para crear un nuevo proyecto Analog, puedes usar el paquete `create-analog` con el gestor de paquetes que prefieras:

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

También puedes [estructurar un nuevo proyecto con Nx](/docs/integrations/nx).

### Sirviendo la aplicación

Para iniciar el servidor de desarrollo para la aplicación, ejecuta el comando `start`.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run start
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn start
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm start
```

  </TabItem>
</Tabs>

Visita [http://localhost:5173](http://localhost:5173) en tu navegador para ver aplicación corriendo
A continuación, puedes [definir rutas adicionales usando componentes](/docs/features/routing/overview) para la navegación.

### Compilando la Aplicación

Para compilar la aplicación para el despliegue

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run build
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn build
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run build
```

### Compilando Artefactos

By default, Analog comes with [Server-Side Rendering](/docs/features/server/server-side-rendering) enabled.
Client artifacts are located in the `dist/analog/public` directory.
The server for the API/SSR build artifacts is located in the `dist/analog/server` directory.

  </TabItem>
</Tabs>
