import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Proveedores

Analog soporta el despliegue en muchos proveedores con poca o ninguna configuración adicional utilizando [Nitro](https://nitro.unjs.io) como motor de servidor subyacente. Puedes encontrar más proveedores en la [documentación de implementación de Nitro](https://nitro.unjs.io/deploy).

## Netlify

Analog soporta el despliegue en [Netlify](https://netlify.com/) con una configuración mínima.

Para el sitio de Netlify, establece el `Publish directory` en `dist/analog/public` y configura la salida como se muestra a continuación en el `vite.config.ts`. Esto despliega los activos estáticos y el servidor como una función de Netlify.

```ts [vite.config.ts]
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  /// ...other config
  plugins: [
    analog({
      nitro: {
        output: {
          dir: './dist/analog',
          serverDir: '{{ rootDir }}/.netlify/functions-internal',
        },
      },
    }),
  ],
}));
```

## Vercel

Anaalog sopoorta el despliegue en [Vercel](https://vercel.com/) con una configuración mínima.

### Desplegando el proyecto

<Tabs groupId="porject-type">
  <TabItem label="Crear analog" value="npm">
Por defecto, al desplegar en Vercel, el preset de compilación se maneja automáticamente.

1. Crear un nuevo proyecto y seleccionar el repositorio que contiene tu código.

2. Click 'Deploy'.

Eso es todo!

  </TabItem>

  <TabItem label="Nx" value="yarn">
  Para hacerlo funcionar con Nx, necesitamos definir la aplicación específica que queremos construir. Hay varias formas de hacerlo, y puedes elegir uno de los siguientes métodos (reemplaza &#60;app&#62; con el nombre de tu aplicación):

1. Define el parámetro `defaultProject` en tu `nx.json`

```json [nx.json]
{
  "defaultProject": "<app>"
}
```

2. Crear un fichero `vercel.json` en la raíz de tu proyecto y definir el `buildCommand`:

```json [vercel.json]
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "nx build <app>"
}
```

3. Definir el `buildCommand` en tu `package.json`:

```json [package.json]
{
  "scripts": {
    "build": "nx build <app>"
  }
}
```

  </TabItem>
</Tabs>

### Estableciendo el preset manualmente

Puede haber un caso en el que Vercel no cargue el preset automáticamente. En ese caso, puedes hacer una de las siguientes cosas.

- Establece la variable de entorno `BUILD_PRESET` en `vercel`.
- Establece el preset en el fichero `vite.config.ts`:

```ts [vite.config.ts]
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  /// ...other config
  plugins: [
    analog({
      nitro: {
        preset: 'vercel',
      },
    }),
  ],
}));
```

#### Nx y Vercel

Cuando se usa Nx y se reutiliza la caché de compilación en la plataforma de compilación de Vercel, existe la posibilidad de que la caché se reutilice si la has construido localmente. Esto puede provocar que la salida se coloque en la ubicación incorrecta. Para resolver este problema, puedes usar el preset en el fichero `vite.config.ts` como solución alternativa.

## Cloudflare Pages y Workers

Anaalog soporta el despliegue en [Cloudflare](https://cloudflare.com/) pages y workers con una configuración mínima.

### Actualizando el punto de entrada del servidor

El fichero `main.server.ts` debe actualizarse para proporcionar la URL completa y el token `APP_BASE_HREF` en el servidor para el soporte de Cloudflare.

```ts
import { renderApplication } from '@angular/platform-server';
import { APP_BASE_HREF } from '@angular/common';
/// imports y código de arranque ...

export default async function render(url: string, document: string) {
  // establecer el href base
  const baseHref = process.env['CF_PAGES_URL'] ?? `http://localhost:8888`;

  // usar la URL completa y proporcionar APP_BASE_HREF
  const html = await renderApplication(bootstrap, {
    document,
    url: `${baseHref}${url}`,
    platformProviders: [{ provide: APP_BASE_HREF, useValue: baseHref }],
  });

  return html;
}
```

### Configurando el directorio de salida

Para el despliegue de Cloudflare, establece la salida como se muestra a continuación. Esto combina los activos estáticos, junto con el worker de Cloudflare en el mismo directorio de salida.

```ts [vite.config.ts]
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  /// ...other config
  plugins: [
    analog({
      nitro: {
        output: {
          dir: './dist/analog/public',
          serverDir: './dist/analog/public',
        },
      },
    }),
  ],
}));
```

### Desplegando a Cloudflare

Para conectar tu repositorio y desplegar automáticamente a Cloudflare:

1. Inicia sesión en el panel de control de Cloudflare y selecciona tu cuenta.
2. En la página de inicio de la cuenta, selecciona Workers & Pages.
3. Selecciona Create application > Pages > Connect to Git.
4. Ingresa `npm run build` como el `Build Command`.
5. Ingresa `dist/analog/public` como el `Build output directory`.
6. Deja la otra configuración predeterminada, haz clic en `Save and Deploy`.

La aplicación se despliega en la red de Cloudflare en cada push al repositorio.

### Ejecutando la aplicación localmente usando Wrangler

Tambien puedes ejecutar la aplicación ejecutando localmente en Cloudflare:

1. Establece la variable de entorno `BUILD_PRESET` en `cloudflare-pages` antes de ejecutar la compilación

```sh
BUILD_PRESET=cloudflare-pages npm run build
```

2. Usa la CLI `wrangler` para ejecutar la aplicación localmente

```sh
npx wrangler pages dev ./dist/analog/public
```

## Firebase

Analog soporta [Firebase Hosting](https://firebase.google.com/docs/hosting) con Cloud Functions de forma nativa.

Vea un [Repositorio de Ejemplo](https://github.com/brandonroberts/analog-angular-firebase-example) con Firebase configurado.

**Nota**: Necesitas estar en el **plan Blaze** para usar Analog con Cloud Functions.

Si aún no tienes un `firebase.json` en tu directorio raíz, Analog lo creará la primera vez que lo ejecutes. En este fichero, deberás reemplazar `<your_project_id>` con la ID de tu proyecto Firebase.

Este fichero luego debe ser subido al control de versiones. También puedes crear un fichero `.firebaserc` si no quieres pasar manualmente la ID de tu proyecto a tus comandos `firebase` (con `--project <your_project_id>`):

```json [.firebaserc]
{
  "projects": {
    "default": "<your_project_id>"
  }
}
```

Luego, solo agrega las dependencias de Firebase a su proyecto:

```bash
npm install -D firebase-admin firebase-functions firebase-functions-test
```

### Usando el Firebase CLI

Si prefieres configurar tu proyecto con el Firebase CLI, que obtendrá tu ID de proyecto por ti, agrega las dependencias requeridas (ver arriba) e incluso configura despliegues automatizados con GitHub Actions.

#### Instalar el Firebase CLI globalmente

```bash
npm install -g firebase-tools
```

**Nota**: Necesitas estar en [^11.18.0](https://github.com/firebase/firebase-tools/releases/tag/v11.18.0) para desplegar una función nodejs18.

#### Inicializar tu proyecto Firebase

```bash
firebase login
firebase init hosting
```

Cuantdo se te solicite, selecciona tu proyecto Firebase y elige `dist/analog/public` como el directorio `public`.

En el siguiente paso, **no** configures tu proyecto como una aplicación de una sola página (single-page).

Cuando la configuración esté completa, agrega lo siguiente a tu `firebase.json` para habilitar el renderizado del servidor en Cloud Functions:

```json [firebase.json]
{
  "functions": { "source": "dist/analog/server" },
  "hosting": [
    {
      "site": "<your_project_id>",
      "public": "dist/analog/public",
      "cleanUrls": true,
      "rewrites": [{ "source": "**", "function": "server" }]
    }
  ]
}
```

Puedes encontrar más detalles en la [documentación de Firebase](https://firebase.google.com/docs/hosting/quickstart).

### Previsualización local

Puedes previsualizar una versión local de tu sitio para probar las cosas sin desplegar.

```bash
BUILD_PRESET=firebase npm run build
firebase emulators:start
```

### Desplegar a Firebase Hosting usando el CLI

Para desplegar a Firebase Hosting, ejecuta el comando `firebase deploy`.

```bash
BUILD_PRESET=firebase npm run build
firebase deploy
```

## Render.com

Analog soporta el despliegue en [Render](https://render.com/) con una configuración mínima.

### Despliegue del servicio web

1. [Crear un nuevo servicio web](https://dashboard.render.com/select-repo?type=web) y seleccionar el repositorio que contiene tu código.

2. Asegúrate de que el entorno 'Node' esté seleccionado.

3. [Especifica la versión de Node para que Render la use](https://render.com/docs/node-version) (se recomienda v18.13.0 o superior) - Render por defecto usa Node 14, que no puede construir correctamente un sitio Analog

4. Dependiendo de tu gestor de paquetes, establece el comando de compilación en `yarn && yarn build`, `npm install && npm run build`, o `pnpm i --shamefully-hoist && pnpm build`.

5. Actualiza el comando de inicio a `node dist/analog/server/index.mjs`

6. Haz Click en 'Advanced' y agrega una variable de entorno con `BUILD_PRESET` establecido en `render-com`.

7. Haz Click en 'Create Web Service'.

### Despliegue de sitio estático

Si estas usando Analog para pre-renderizar contenido estático, puedes desplegar un sitio estático en Render con una configuración mínima

1. [Crea un nuevo sitio estático](https://dashboard.render.com/select-repo?type=static) y selecciona el repositorio que contiene tu código.

2. Dependiendo de tu gestor de paquetes, establece el comando de compilación en `yarn && yarn build`, `npm install && npm run build`, o `pnpm i --shamefully-hoist && pnpm build`.

3. Establece el directorio de publicación en el directorio `public` dentro del directorio de compilación `dist` (por ejemplo, `dist/analog/public`)

4. Haz clic en 'Crear sitio estático'

## Edgio

Analog soporta el despliegue en [Edgio](https://edg.io) con una configuración mínima.

1. Instala la CLI de Edgio:

```bash
npm i -g @edgio/cli
```

2. En tu directorio de proyecto, inicializa Edgio:

```bash
edgio init --connector=@edgio/analogjs
```

3. Despliega a Edgio:

```bash
edgio deploy
```
