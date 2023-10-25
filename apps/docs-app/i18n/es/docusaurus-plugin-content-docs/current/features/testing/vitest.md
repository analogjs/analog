import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Agregando Vitest a un Proyecto Existente

[Vitest](https://vitest.dev) puede ser añadido a un proyecto Angular existente con unos pocos pasos.

## Instalación

Para añadir Vitest, instala los paquetes necesarios:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @analogjs/platform jsdom vite-tsconfig-paths --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @analogjs/platform jsdom vite-tsconfig-paths --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/vite-plugin-angular @analogjs/platform jsdom vite-tsconfig-paths
```

  </TabItem>
</Tabs>

## Configuración para Ejecutar Pruebas en Node

Para configurar Vitest, crea un `vite.config.ts` en la raíz de tu proyecto:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [
    angular(),
    viteTsConfigPaths({
      root: './',
    }),
  ],
  test: {
    globals: true,
    setupFiles: ['src/test.ts'],
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

A continuación, define un archivo `src/test.ts` para configurar el `TestBed`:

```ts
import '@analogjs/vite-plugin-angular/setup-vitest';

import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);
```

A continuación, actualiza el objetivo `test` en el `angular.json` para usar el constructor `@analogjs/platform:vitest`:

```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "your-project": {
      "projectType": "application",
      "architect": {
        "build": ...,
        "serve": ...,
        "extract-i18n": ...,
        "test": {
          "builder": "@analogjs/platform:vitest"
        }
      }
    }
  }
}
```

> También puedes añadir un nuevo objetivo y nombrarlo `vitest` para ejecutarlo junto a tu objetivo `test`.

Finalmente, agrega el archivo `src/test.ts` al arreglo `files` en el `tsconfig.spec.json` en la raíz de tu proyecto, y actualiza los `types`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "types": ["vitest/globals", "node"]
  },
  "files": ["src/test.ts"],
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

## Configuración para Ejecutar Pruebas en el Navegador

Si lo prefieres, puedes ejecutar tus pruebas en un navegador, Vitest tiene soporte experimental para las pruebas en el navegador también.

Primero, sigue los pasos para [ejecutar pruebas en node](#configuración-para-ejecutar-pruebas-en-node).

Después, instala los paquetes necesarios para ejecutar pruebas en el navegador:

<Tabs groupId="package-manager-browser">
  <TabItem value="npm">

```shell
npm install @vitest/browser playwright --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @vitest/browser playwright --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @vitest/browser playwright
```

  </TabItem>
</Tabs>

Update the `test` object in the `vite.config.ts`.

- Remove the `environment: 'jsdom'` property.
- Add a `browser` config for Vitest.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [
    angular(),
    viteTsConfigPaths({
      root: './',
    }),
  ],
  test: {
    globals: true,
    setupFiles: ['src/test.ts'],
    // environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Vitest browser config
    browser: {
      enabled: true,
      name: 'chromium',
      headless: false, // set to true in CI
      provider: 'playwright',
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

## Ejeutan Pruebas

Para ejecutar pruebas unitarias, usa el comando `test`:

<Tabs groupId="package-manager-node">
  <TabItem value="npm">

```shell
npm run test
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn test
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm test
```

  </TabItem>
</Tabs>
