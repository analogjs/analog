import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migrando una Aplicación Angular a Analog

Una Aplicación SPA Angular existente puede configurarse para usar Analog utilizando un schematic/generator para Angular CLI o espacios de trabajo Nx.

> Analog es compatible con Angular v15 y versiones superiores.

## Usando un Schematic/Generator

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
pnpm install -w @analogjs/platform
```

  </TabItem>
</Tabs>

A continuación, ejecuta el comando para configurar la configuración de Vite, actualizar los objetivos de build/serve en la configuración del proyecto, mover los archivos necesarios y opcionalmente configurar Vitest para pruebas unitarias.

```shell
npx ng generate @analogjs/platform:migrate --project [your-project-name]
```

Para proyectos Nx:

```shell
npx nx generate @analogjs/platform:migrate --project [your-project-name]
```

## Actualizando Estilos y Scripts Globales

Si tienes scripts o estilos globales configurados en el archivo `angular.json`, referencia estos dentro de la etiqueta `head` en el `index.html`.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My Analog app</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Configurando Entornos

En una aplicación Angular, los `fileReplacements` se configuran en el archivo `angular.json` para diferentes entornos.

### Usando Variables de Entorno

En Analog, puedes configurar y usar variables de entorno. Este es el enfoque **recomendado**.

Añade un archivo `.env` en la raíz de tu aplicación y prefija cualquier variable de entorno **pública** con `VITE_`. **No** incluyas este archivo en tu repositorio de código fuente.

```sh
VITE_MY_API_KEY=development-key

# Solo disponible en la build del servidor
MY_SERVER_API_KEY=development-server-key
```

Importa y usa la variable de entorno en tu código.

```ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiKey = import.meta.env['VITE_MY_API_KEY'];

  constructor(private http: HttpClient) {}
}
```

Al desplegar, configura tus variables de entorno a sus equivalentes de producción.

```sh
VITE_MY_API_KEY=production-key

# Solo disponible en la build del servidor
MY_SERVER_API_KEY=production-server-key
```

Lee [aquí](https://vitejs.dev/guide/env-and-mode.html) para más información sobre variables de entorno.

### Usando Reemplazos de Archivos

También puedes usar el plugin `replaceFiles()` de Nx para reemplazar archivos durante tu build.

Importa el plugin y configúralo:

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import { replaceFiles } from '@nx/vite/plugins/rollup-replace-files.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    analog(),
    mode === 'production' &&
      replaceFiles([
        {
          replace: 'src/environments/environment.ts',
          with: 'src/environments/environment.prod.ts',
        },
      ]),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

Añade los archivos de entorno al arreglo `files` en el archivo `tsconfig.app.json` también puede ser necesario.

```json
{
  "extends": "./tsconfig.json",
  // otra configuración
  "files": [
    "src/main.ts",
    "src/main.server.ts",
    "src/environments/environment.prod.ts"
  ]
}
```

## Configuración para Ejecutar las Pruebas en el Navegador

Si prefieres ejecutar tus pruebas en un navegador, Vitest ofrece soporte experimental para ello.

Primero, sigue los pasos para [ejecutar pruebas en Node](#setup-for-running-tests-for-node).

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
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
);
```

# Ejecutando las Pruebas

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
    }),
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
