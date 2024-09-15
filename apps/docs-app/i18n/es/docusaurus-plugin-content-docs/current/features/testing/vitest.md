import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Incorporando Vitest a un proyecto existente

[Vitest](https://vitest.dev) puede ser añadido a espacios de trabajo de Angular existentes a través de un simple proceso.

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

## Configuración para ejecutar las pruebas sobre Node

Para configurar Vitest, crea un fichero `vite.config.ts` en la raíz de tu proyecto:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), viteTsConfigPaths()],
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

Luego, crea un fichero `src/test.ts` para configurar el `TestBed`:

```ts
import '@analogjs/vite-plugin-angular/setup-vitest';

import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
```

A continuación, actualiza la propiedad `test` en el fichero `angular.json` para usar el constructor `@analogjs/platform:vitest`:

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

> También puedes agregar una nueva propiedad denominada `vitest` para que se ejecute junto a `test`.

Por último, añade `src/test.ts` a la lista `files` en el fichero `tsconfig.spec.json` en la raíz del proyecto, y actualiza la propiedad `types`.

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

## Configuración para ejecutar las puebas en el navegador

Si prefieres ejecutar tus pruebas en un navegador, Vitest ofrece soporte experimental para ello.

Primero, sigue los pasos para [ejecutar pruebas sobre Node](#setup-for-running-tests-for-node)

Luego, instala las dependencias necesarias.

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

Actualiza la propiedad `test` en el fichero `vite.config.ts`.

- Elimina la propiedad `environment: 'jsdom'`.
- Añade el objeto `browser` con la configuración adecuada.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), viteTsConfigPaths()],
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

## Ejecutando las pruebas

Para ejecutar pruebas unitarias, utiliza el comando `test`:

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
