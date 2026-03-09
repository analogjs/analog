import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migrando una Aplicación Angular a Analog

Una Aplicación SPA Angular existente puede configurarse para usar Analog utilizando un schematic/generator para Angular CLI o espacios de trabajo Nx.

> Analog es compatible con Angular v15 y versiones superiores.

## Usando un Schematic/Generator

Primero, instalar el paquete `@analogjs/platform`:

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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    analog({
      fileReplacements:
        mode === 'production'
          ? [
              {
                replace: 'src/environments/environment.ts',
                with: 'src/environments/environment.prod.ts',
              },
            ]
          : [],
    }),
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

## Copiando arhicos estáticos

Los archivos estáticos en la carpeta `public` son copiados al directorio de salida del build por defecto. Si deseas copiar archivos adicionales fuera de ese directorio, utiliza el plugin de Vite `nxCopyAssetsPlugin`.

Importa el plugin y configúralo:

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...
  plugins: [analog(), nxCopyAssetsPlugin(['*.md'])],
}));
```
