---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Usando Storybook con Angular y Vite

[Storybook](https://storybook.js.org) es un taller frontend para construir componentes de UI y páginas de forma aislada.

Por defecto, Angular y Storybook usan Webpack para construir y servir la aplicación Storybook.

Este tutorial te guía a través del proceso de cambiar a construir y servir tu Storybook con Angular usando Vite. Este proceso se puede aplicar a _cualquier_ proyecto de Angular que use Storybook.

## Configurando Storybook

Si aún no tienes Storybook configurado, ejecuta el siguiente comando para inicializar Storybook para tu proyecto:

```sh
npx storybook@latest init
```

Sigue las indicaciones proporcionadas y haz commit de tus cambios.

## Instalando los paquetes de Storybook y Vite

Instala el Vite Plugin para Angular y el Vite Builder para Storybook. Dependiendo de tu gestor de paquetes preferido, ejecuta uno de los siguientes comandos:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @storybook/builder-vite --save-dev
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @storybook/builder-vite --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/vite-plugin-angular @storybook/builder-vite -w --save-dev
```

  </TabItem>

  <TabItem value="bun">

```shell
bun install @analogjs/vite-plugin-angular @storybook/builder-vite --save-dev
```

  </TabItem>  
</Tabs>

## Configurando Storybook para usar el Vite Builder

Actualiza el archivo `.storybook/main.ts` para usar `@storybook/builder-vite` y añade la función de configuración `viteFinal` para configurar el Vite Plugin para Angular.

```ts
import { StorybookConfig } from '@storybook/angular';
import { StorybookConfigVite } from '@storybook/builder-vite';
import { UserConfig } from 'vite';

const config: StorybookConfig & StorybookConfigVite = {
  // otra configuración, addons, etc.
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: undefined,
      },
    },
  },
  async viteFinal(config: UserConfig) {
    // Fusiona la configuración personalizada con la configuración por defecto
    const { mergeConfig } = await import('vite');
    const { default: angular } = await import('@analogjs/vite-plugin-angular');

    return mergeConfig(config, {
      // Agrega dependencias para pre-optimización
      optimizeDeps: {
        include: [
          '@storybook/angular',
          '@storybook/angular/dist/client',
          '@angular/compiler',
          '@storybook/blocks',
          'tslib',
        ],
      },
      plugins: [angular({ jit: true, tsconfig: './.storybook/tsconfig.json' })],
    });
  },
};
```

Elimina la función de configuración existente `webpackFinal` si está presente.

Luego, actualiza el `package.json` para ejecutar los comandos de Storybook directamente.

```json
{
  "name": "my-app",
  "scripts": {
    "storybook": "storybook dev --port 4400",
    "build-storybook": "storybook build"
  }
}
```

> También puedes eliminar los targets de Storybook en el angular.json

Si estás usando [Nx](https://nx.dev), actualiza los targets de Storybook en tu `project.json` para ejecutar los comandos de Storybook:

```json
    "storybook": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/my-app",
        "command": "storybook dev --port 4400"
      }
    },
    "build-storybook": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/my-app",
        "command": "storybook build --output-dir ../../dist/storybook/my-app"
      }
    }
```

Añade la carpeta `/storybook-static` a tu archivo `.gitignore`.

## Ejecutando Storybook

Ejecuta los comandos de Storybook directamente para correr el servidor de desarrollo.

```sh
npm run storybook
```

## Construyendo Storybook

Ejecuta los comandos de Storybook para construir el Storybook.

```sh
npm run build-storybook
```
