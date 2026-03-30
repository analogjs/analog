---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Usando Storybook con Angular y Vite

[Storybook](https://storybook.js.org) es un taller frontend para construir componentes de UI y páginas de forma aislada.

Por defecto, Angular y Storybook usan Webpack para construir y servir la aplicación Storybook.

Este tutorial te guía a través del proceso de cambiar a construir y servir tu Storybook con Angular usando Vite. Este proceso se puede aplicar a _cualquier_ proyecto de Angular que use Storybook.

> Esta es una integración de la comunidad, no es mantenida por el equipo de Storybook. Si tienes algún inconveniente, regístralo en nuestro [repositorio de GitHub](https://github.com/analogjs/analog/issues).

## Guía de compatibilidad

La integración de Storybook de AnalogJS para usar Angular y Vite admite múltiples versiones de Storybook. Consulta la tabla a continuación para saber cual versión instalar según las dependencias del proyecto.

| Storybook Versión | Analog Versión |
| ----------------- | -------------- |
| ^10.0.0           | ^2.0.0         |
| ^9.0.0            | ^1.22.0        |
| ^8.6.0            | ^1.22.0        |

## Configurando Storybook

Si aún no tienes Storybook configurado, ejecuta el siguiente comando para inicializar Storybook para tu proyecto:

```sh
npx storybook@latest init
```

Sigue las indicaciones proporcionadas y haz commit de tus cambios.

## Installing the Storybook package

Instala la integración de Storybook para Angular y Vite. Dependiendo de tu gestor de paquetes preferido, ejecuta uno de los siguientes comandos:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/storybook-angular --save-dev
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @analogjs/storybook-angular --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/storybook-angular -w --save-dev
```

  </TabItem>

  <TabItem value="bun">

```shell
bun install @analogjs/storybook-angular --save-dev
```

  </TabItem>  
</Tabs>

## Configurando Storybook

Actualizar el archivo `.storybook/main.ts` para usar el tipo `StorybookConfig`. Además actualizar el `framework` para usar el paquete `@analogjs/storybook-angular`.

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // otras configuraciones
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
};

export default config;
```

Quitar la configuración existente de Remove `webpackFinal` (si es que está presente).

Después, los objetivos de Storybook en el archivo `angular.json` o `project.json`

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook"
    }
```

Quitar cualquier opcion especifica de `webpack` y quitar la opcion `browserTarget`.

Agregar esta carpeta `/storybook-static` en el archivo `.gitignore`.

## Configurando CSS

Para registrar estilos globales, agregarlos en la opcion del constructor `@analogjs/storybook-angular` en el archivo `angular.json` o `project.json`.

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... otras opciones
        "styles": [
          "src/styles.css"
        ],
        "stylePreprocessorOptions": {
          "loadPaths": ["libs/my-lib/styles"]
        }
      }
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... otras opciones
        "styles": [
          "src/styles.css"
        ],
        "stylePreprocessorOptions": {
          "loadPaths": ["libs/my-lib/styles"]
        }
      }
    }
```

## Activando la detección de cambios Zoneless

Para utilizar la detección de cambios Zoneless en Storybook, agregar la bandera `experimentalZoneless` al builder `@analogjs/storybook-angular` en el archivo `angular.json` o `project.json`.

<Tabs groupId="zoneless-change-detection">
  <TabItem value="angular.json">

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... otras opciones
        "experimentalZoneless": true
      }
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... otras opciones
        "experimentalZoneless": true
      }
    }
```

  </TabItem>
  <TabItem value="project.json">

```json
    "storybook": {
      "executor": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... other options
        "configDir": "path/to/.storybook",
        "experimentalZoneless": true,
        "compodoc": false
      }
    },
    "build-storybook": {
      "executor": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... other options
        "configDir": "path/to/.storybook",
        "experimentalZoneless": true,
        "compodoc": false
      }
    }
```

  </TabItem>
</Tabs>

> La detección de cambios Zoneless es la opción por defecto en proyectos nuevos de Angular v21.

## Configurando archivos estáticos

Los archivos estáticos son configurados en el archivp `.storybook/main.ts` utilizando el arreglo `staticDirs`.

Por ejemplo a continuación se muestra como agregar el directorio público `public` con la ruta relativa `src/public` en el archivo `.storybook/main.ts`.

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // otras configuraciones
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
  staticDirs: ['../public'],
};

export default config;
```

Para más información [revisar la documentación de Storybook para imágenes y estáticos](https://storybook.js.org/docs/configure/integration/images-and-assets).

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

## Utilizando los alias de rutas de la configuración de TypeScript

Si estas utilziando `paths` en tu `tsconfig.json`, el soporte para estos alias puede ser agregado en el archivo `vite.config.ts`.

### Angular CLI

Primero, instalar el paquete `vite-tsconfig-paths`.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install vite-tsconfig-paths --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add vite-tsconfig-paths --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w vite-tsconfig-paths --save-dev
```

  </TabItem>
</Tabs>

Luego, agregar el plugin en el arreglo de `plugins` en el archivo `.storybook/main.ts`.

```ts
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... otras configuraciones
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [viteTsConfigPaths()],
    });
  },
};

export default config;
```

### Nx

Para espacios de trabajo Nx, importar y usar el plugin `nxViteTsPaths` para el paquete `@nx/vite`. Agregarlo en el arreglo `plugins` en el archivo `.storybook/main.ts`.

```ts
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... otras configuraciones
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [nxViteTsPaths()],
    });
  },
};

export default config;
```

## Usando el reemplazo de archivos

También puedes utilizar el plugin `replaceFiles()` de Nx para reemplazar archivos durante la construcción.

Importar el plugin y configurarlo:

```ts
import { replaceFiles } from '@nx/vite/plugins/rollup-replace-files.plugin';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... otras opciones.
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [
        replaceFiles([
          {
            replace: './src/one.ts',
            with: './src/two.ts',
          },
        ]),
      ],
    });
  },
};

export default config;
```

Agregando el reemplzado de archivos en el arreglo `files` del archivo `tsconfig.app.json` puede ser necesario.

```json
{
  "extends": "./tsconfig.json",
  // otras opcoines
  "files": ["src/main.ts", "src/main.server.ts", "src/two.ts"]
}
```

## Configurando Vitest para Pruebas de Interacción

Storybook también admite el uso de Vitest para probar interacciones de componentes.

### Instalando Paquetes

Instala el addon de Vitest y las dependencias:

```sh
npm install @analogjs/vitest-angular @storybook/addon-vitest vitest @vitest/browser-playwright --save-dev
```

### Agregar el Add-on de Vitest

Agrega el addon a tu archivo `.storybook/main.ts`:

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
};

export default config;
```

### Configurar Vitest

Crea un archivo `.storybook/vitest.setup.ts`:

```ts
import '@angular/compiler';
import { setProjectAnnotations } from '@analogjs/storybook-angular/testing';
import { beforeAll } from 'vitest';
import * as projectAnnotations from './preview';

const project = setProjectAnnotations([projectAnnotations]);

beforeAll(project.beforeAll);
```

Actualiza `.storybook/tsconfig.json` para incluir el archivo de configuración:

```json
{
  "extends": "../tsconfig.app.json",
  "compilerOptions": {
    "types": ["node"],
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true
  },
  "exclude": ["../src/test.ts", "../src/**/*.spec.ts"],
  "include": ["../src/**/*.stories.*", "./preview.ts", "./vitest.setup.ts"],
  "files": ["./typings.d.ts"]
}
```

Crea un archivo `vitest.config.ts` en la raíz de tu proyecto, o agrega un proyecto `storybook` a tu `vite.config.ts` existente:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
});
```

### Instalando Playwright

Instala los binarios del navegador Playwright:

```sh
npx playwright install chromium
```

### Ejecutando Pruebas de Componentes

Agrega el target `test-storybook` a tu `angular.json`:

```json
"test-storybook": {
  "builder": "@analogjs/vitest-angular:test",
  "options": {
    "configFile": "vitest.config.ts"
  }
}
```

Agrega un script de prueba a tu `package.json`:

```json
"scripts": {
  "test-storybook": "ng run your-app:test-storybook"
}
```

Ejecuta tus pruebas de interacción con:

```sh
npm run test-storybook
```

También puedes ejecutar pruebas directamente en la interfaz de usuario de Storybook. Inicia Storybook y usa el botón "Run Tests" en la barra lateral, o navega a una historia para ver las pruebas de interacción ejecutarse automáticamente en el panel de Interacciones.
