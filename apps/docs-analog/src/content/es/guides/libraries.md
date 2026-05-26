import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Crear una librería de Angular

Las librerías de Angular se crean para dar soporte a diferentes servicios y funcionalidades. Estas se pueden crear utilizando Vite y se pueden publicar en npm.

## Crear una librería

Si estás creando un paquete nuevo, utiliza el esquema de `library`:

```sh
ng generate lib my-lib
```

Para una librería existente, sigue las siguientes instrucciones de configuración.

## Configuración

Instalar el paquete `@analogjs/platform`:

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
pnpm install -w @analogjs/platform
```

  </TabItem>
</Tabs>

A continuación, crear el archivo `vite.config.ts` en la raíz del proyecto, y configurarlo para buildear la librería.

> Actualizar las referencias de `my-lib` para coincidir con el nombre del proyecto.

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/my-lib',
  plugins: [angular()],
  resolve: {
    mainFields: ['module'],
  },
  build: {
    target: ['esnext'],
    sourcemap: true,
    lib: {
      // Library entry point
      entry: 'src/public-api.ts',

      // Package output path, must contain fesm2022
      fileName: `fesm2022/my-lib`,

      // Publish as ESM package
      formats: ['es'],
    },
    rollupOptions: {
      // Add external libraries that should be excluded from the bundle
      external: [/^@angular\/.*/, 'rxjs', 'rxjs/operators'],
      output: {
        // Produce a single file bundle
        preserveModules: false,
      },
    },
    minify: false,
  },
}));
```

Luego, actualizar la configuración del proyecto para utilizar el constructor `@analogjs/platform:vite` y buildear la librería.

```json
{
  "name": "my-lib",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "projects/my-lib/src",
  "prefix": "lib",
  "projectType": "library",
  "architect": {
    "build": {
      "builder": "@analogjs/platform:vite",
      "options": {
        "configFile": "projects/my-lib/vite.config.ts",
        "outputPath": "dist/projects/my-lib"
      },
      "defaultConfiguration": "production",
      "configurations": {
        "development": {
          "mode": "development"
        },
        "production": {
          "sourcemap": true,
          "mode": "production"
        }
      }
    }
  }
}
```

Modificar el archivo `package.json` que está en la raíz del proyecto, y ajustar la salida del build. Incluir toda `dependencies` o `peerDependencies` necesarias para instalar el paquete.

```json
{
  "name": "my-lib",
  "description": "A description of the Angular library",
  "type": "module",
  "peerDependencies": {
    "@angular/common": "^19.0.0",
    "@angular/core": "^19.0.0"
  },
  "dependencies": {
    "tslib": "^2.0.0"
  },
  "types": "./src/public-api.d.ts",
  "exports": {
    "./package.json": {
      "default": "./package.json"
    },
    ".": {
      "import": "./fesm2022/my-lib.mjs",
      "require": "./fesm2022/my-lib.mjs",
      "default": "./fesm2022/my-lib.mjs"
    }
  },
  "sideEffects": false,
  "publishConfig": {
    "access": "public"
  }
}
```

## Copiando los archivos estáticos

Los archivos estáticos en la carpeta `public` son copiados por defecto al directorio de salida del build. Si quieres copiar cualquier otro archivos fuera de este directorio, utilizar el plugin de Vite `nxCopyAssetsPlugin`.

Importar el plugin y configurarlo:

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/vite-plugin-angular';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...
  plugins: [angular(), nxCopyAssetsPlugin(['*.md', 'package.json'])],
}));
```

## Armando al librería

Ejecutar el comando de armado:

```sh
ng build my-lib
```

## Publicando la librería

Luego de iniciar sesión utilizando `npm login`, ejecutar el comando `npm publish` para publicar el paquete.

Para ver la salida del comando sin publicar, utilizar la bandera `--dry-run`.

```sh
npm publish dist/projects/my-lib --dry-run
```

Para publicar la librería en npm:

```sh
npm publish dist/projects/my-lib
```
