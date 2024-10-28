import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Usando Vitest con un Proyecto Angular

[Vitest](https://vitest.dev) puede ser añadido a **_cualquier_** proyecto Angular existente con unos pocos pasos.

## Configuración Automatizada Usando un Schematic/Generator

Vitest puede ser instalado y configurado usando un schematic/generator para Angular CLI o espacios de trabajo Nx.

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
pnpm install -w @analogjs/platform --save-dev
```

  </TabItem>
</Tabs>

A continuación, ejecuta el schematic para configurar la configuración de Vite, archivos de configuración de pruebas y actualizar la configuración de pruebas.

```shell
ng g @analogjs/platform:setup-vitest --project [your-project-name]
```

Luego, ve a [ejecutando pruebas](#running-tests)

## Instalación Manual

Para añadir Vitest manualmente, instala los paquetes necesarios:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --save-dev
```

  </TabItem>
</Tabs>

## Configuración para Ejecutar las Pruebas en Node

Para configurar Vitest, crea un archivo `vite.config.ts` en la raíz de tu proyecto:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  plugins: [angular()],
  test: {
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

Luego, crea un archivo `src/test-setup.ts` para configurar el `TestBed`:

### Configuración de Zone.js

Si estás usando `Zone.js` para la detección de cambios, importa el script `setup-zone`. Este script incluye automáticamente soporte para configurar pruebas de snapshots.

```ts
import '@analogjs/vitest-angular/setup-zone';

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

### Configuración Sin Zone

Si estás usando detección de cambios `Zoneless`, solo importa el script `setup-snapshots`.

```ts
import '@analogjs/vitest-angular/setup-snapshots';

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

A continuación, actualiza la propiedad `test` en el archivo `angular.json` para usar el constructor `@analogjs/vitest-angular:test`:

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
          "builder": "@analogjs/vitest-angular:test"
        }
      }
    }
  }
}
```

> También puedes agregar una nueva propiedad denominada `vitest` para que se ejecute junto a tu objetivo `test`.

Por último, añade `src/test-setup.ts` al arreglo `files` en el archivo `tsconfig.spec.json` en la raíz del proyecto, y actualiza la propiedad `types`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "target": "es2016",
    "types": ["vitest/globals", "node"]
  },
  "files": ["src/test-setup.ts"],
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

Luego, ve a [ejecutando pruebas](#running-tests)

## Configuración para Ejecutar las Pruebas en el Navegador

Si prefieres ejecutar tus pruebas en un navegador, Vitest ofrece soporte experimental para ello.

Primero, sigue los pasos para [ejecutar pruebas en node](#setup-for-running-tests-for-node).

Luego, instala los paquetes necesarios para ejecutar pruebas en el navegador:

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

Actualiza el objeto `test` en el archivo `vite.config.ts`.

- Elimina la propiedad `environment: 'jsdom'`.
- Añade una configuración `browser` para Vitest.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  plugins: [angular()],
  test: {
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    // environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Configuración de Vitest para navegador
    browser: {
      enabled: true,
      name: 'chromium',
      headless: false, // establecer en true en CI
      provider: 'playwright',
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

Luego, añade la importación de `@angular/compiler` al archivo `src/test-setup.ts`.

```ts
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-zone';

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

## Ejecutando las Pruebas

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

> El comando `npx vitest` también puede ser usado directamente.

## Pruebas de Snapshots

Para pruebas de snapshots puedes usar `toMatchSnapshot` de la API `expect`.

A continuación, se muestra un pequeño ejemplo de cómo escribir una prueba de snapshot:

```ts
// card.component.spec.ts

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardComponent } from './card.component';

describe('CardComponent', () => {
  let fixture: ComponentFixture<CardComponent>;
  let component: CardComponent;

  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [CardComponent],
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(fixture).toMatchSnapshot();
  });
});
```

Después de ejecutar la prueba, se crea un archivo `card.component.spec.ts.snap` en la carpeta `__snapshots__` con el siguiente contenido:

```ts
// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[`CardComponent > should create the app 1`] = `
  <component-code>
`;
```

Los snapshots generados deben ser revisados y añadidos al control de versiones.

## Usando Alias de Path en la Configuración de TypeScript

Si estás usando `paths` en tu `tsconfig.json`, el soporte para esos alias puede ser añadido a la configuración de `vite.config.ts`.

### Con Angular CLI

Primero, instala el paquete `vite-tsconfig-paths`.

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

Luego, añade el plugin al arreglo `plugins` en el archivo `vite.config.ts` con `root` establecido como la ruta relativa a la raíz del proyecto.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), viteTsConfigPaths()],
}));
```

### Con Nx

Para espacios de trabajo Nx, importa y usa el plugin `nxViteTsPaths` del paquete `@nx/vite`.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), nxViteTsPaths()],
}));
```
