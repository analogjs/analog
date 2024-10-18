import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Proveedores

Analog soporta el despliegue en muchos proveedores con poca o ninguna configuración adicional usando [Nitro](https://nitro.unjs.io) como su motor de servidor subyacente. Puedes encontrar más proveedores en la [documentación de despliegue de Nitro](https://nitro.unjs.io/deploy).

## Netlify

Analog soporta el despliegue en [Netlify](https://netlify.com/) con configuración mínima.

### Desplegando el Proyecto

<Tabs groupId="porject-type">
  <TabItem label="Create analog" value="create-analog">
En la configuración de compilación de tu proyecto de Netlify, establece el [directorio de publicación](https://docs.netlify.com/configure-builds/overview/#definitions) en `dist/analog/public` para desplegar los activos estáticos y el [directorio de funciones](https://docs.netlify.com/configure-builds/overview/#definitions) en `dist/analog` para desplegar el servidor.
  </TabItem>

  <TabItem label="Nx" value="nx">
En la configuración de compilación de tu proyecto de Netlify en la interfaz web, haz lo siguiente.
1. Establece el [comando de compilación](https://docs.netlify.com/configure-builds/overview/#definitions) en `nx build [nombre-de-tu-proyecto]`
2. Establece el [directorio de publicación](https://docs.netlify.com/configure-builds/overview/#definitions) en `dist/[nombre-de-tu-proyecto]/analog/public` para desplegar los activos estáticos
3. Establece el [directorio de funciones](https://docs.netlify.com/configure-builds/overview/#definitions) en `dist/[nombre-de-tu-proyecto]/analog` para desplegar el servidor.

También puedes configurar esto colocando un archivo `netlify.toml` en la raíz de tu repositorio. A continuación se muestra una configuración de ejemplo.

```toml
# reemplaza "my-analog-app" con el nombre de la aplicación que deseas desplegar
[build]
  command = "nx build my-analog-app"
  publish = "dist/my-analog-app/analog/public"
  functions = "dist/my-analog-app/analog"
```

  </TabItem>
</Tabs>

## Vercel

Analog soporta el despliegue en [Vercel](https://vercel.com/) sin configuración adicional.

### Desplegando el Proyecto

<Tabs groupId="porject-type">
  <TabItem label="Create analog" value="create-analog">
Por defecto, al desplegar en Vercel, el preset de compilación se maneja automáticamente.

1. Crea un nuevo proyecto y selecciona el repositorio que contiene tu código.

2. Haz clic en 'Deploy'.

¡Y eso es todo!

  </TabItem>

  <TabItem label="Nx" value="nx">
Para que funcione con Nx, necesitamos definir la aplicación específica que queremos compilar. Hay varias formas de hacer esto, y puedes elegir uno de los siguientes métodos (reemplaza &#60;app&#62; con el nombre de tu aplicación):

1. Define el `defaultProject` en tu `nx.json`

```json [nx.json]
{
  "defaultProject": "<app>"
}
```

2. Crea un archivo `vercel.json` en la raíz de tu proyecto y define el `buildCommand`:

```json [vercel.json]
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "nx build <app>"
}
```

3. Define el `buildCommand` en tu `package.json`:

```json [package.json]
{
  "scripts": {
    "build": "nx build <app>"
  }
}
```

#### Nx y Vercel

Al usar Nx y reutilizar el caché de compilación en la plataforma de compilación de Vercel, existe la posibilidad de que el caché se reutilice si la has compilado localmente. Esto puede llevar a que la salida se coloque en la ubicación incorrecta. Para resolver este problema, puedes usar el preset en el archivo `vite.config.ts` como solución temporal.

  </TabItem>
</Tabs>

### Configurando el Preset Manualmente

Puede haber casos en los que Vercel no cargue el preset automáticamente. En ese caso, puedes hacer una de las siguientes opciones.

- Establece la variable de entorno `BUILD_PRESET` en `vercel`.
- Establece el preset en el archivo `vite.config.ts`:

```ts [vite.config.ts]
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  /// ...otra configuración
  plugins: [
    analog({
      nitro: {
        preset: 'vercel',
      },
    }),
  ],
}));
```

## Cloudflare Pages

Analog soporta el despliegue en [Cloudflare](https://cloudflare.com/) Pages con configuración mínima.

### Desplegando en Cloudflare

Para conectar tu repositorio y desplegar automáticamente en Cloudflare:

1. Inicia sesión en el panel de control de Cloudflare y selecciona tu cuenta.
2. En la página de inicio de la cuenta, selecciona Workers & Pages.
3. Selecciona Crear aplicación > Pages > Conectar a Git.
4. Ingresa `npm run build` como el `Comando de Compilación`.
5. Ingresa `dist/analog/public` como el `Directorio de salida de compilación`.
6. Deja los demás ajustes predeterminados, haz clic en `Guardar y Desplegar`.

La aplicación se despliega en la red de Cloudflare en cada push al repositorio.

#### Nx y Cloudflare

Para los espacios de trabajo de Nx, la salida de compilación está bajo el nombre de la aplicación. Actualiza el `Directorio de salida de compilación` en consecuencia.

Por ejemplo:

Directorio de salida de compilación: `dist/[nombre-de-tu-proyecto]/analog/public`

Para probar la compilación localmente, ejecuta el siguiente comando:

```bash
BUILD_PRESET=cloudflare-pages npx nx build [nombre-de-tu-proyecto]
```

### Ejecutando la aplicación localmente usando Wrangler

También puedes previsualizar la aplicación ejecutándose localmente en Cloudflare:

1. Establece la variable de entorno `BUILD_PRESET` en `cloudflare-pages` antes de ejecutar la compilación

```bash
BUILD_PRESET=cloudflare-pages npm run build
```

2. Usa la CLI `wrangler` para ejecutar la aplicación localmente

```bash
npx wrangler pages dev ./dist/analog/public
```

## Firebase

Analog soporta [Firebase Hosting](https://firebase.google.com/docs/hosting) con Cloud Functions de forma predeterminada.

Consulta un [Repositorio de Ejemplo](https://github.com/brandonroberts/analog-angular-firebase-example) con Firebase configurado.

**Nota**: Necesitas estar en el **plan Blaze** para usar Analog con Cloud Functions.

Si aún no tienes un `firebase.json` en tu directorio raíz, Analog creará uno la primera vez que lo ejecutes. En este archivo, deberás reemplazar `<your_project_id>` con el ID de tu proyecto de Firebase.

Este archivo debe ser luego comprometido en el control de versiones. También puedes crear un archivo `.firebaserc` si no deseas pasar manualmente el ID de tu proyecto a tus comandos de `firebase` (con `--project <your_project_id>`):

```json [.firebaserc]
{
  "projects": {
    "default": "<your_project_id>"
  }
}
```

Luego, simplemente agrega las dependencias de Firebase a tu proyecto:

```bash
npm install -D firebase-admin firebase-functions firebase-functions-test
```

### Usando Firebase CLI

Si prefieres configurar tu proyecto con Firebase CLI, que obtendrá el ID de tu proyecto por ti, agrega las dependencias requeridas (ver arriba) e incluso configura despliegues automatizados con GitHub Actions.

#### Instalar Firebase CLI globalmente

```bash
npm install -g firebase-tools
```

**Nota**: Necesitas estar en [^11.18.0](https://github.com/firebase/firebase-tools/releases/tag/v11.18.0) para desplegar una función nodejs18.

#### Inicializar tu proyecto Firebase

Inicia sesión en Firebase y selecciona las opciones de **Hosting** y **Functions** como se muestra a continuación:

```bash
firebase login
firebase init
 ◉ Functions: Configure a Cloud Functions directory and its files
 ◉ Hosting: Configure files for Firebase Hosting and (optionally) set up
GitHub Action deploys
```

A menos que tengas un proyecto Firebase existente, selecciona **Crear un nuevo proyecto** para continuar. Firebase provisionará un nuevo proyecto y proporcionará la URL para acceder a la consola web para gestionarlo.

Una vez creado tu proyecto, selecciona **TypeScript** como el lenguaje para escribir las Cloud Functions. Procede aceptando los parámetros predeterminados presionando _Enter_.

Cuando se te solicite el **directorio público**, ingresa `dist/analog/public`.

En el siguiente paso, toma la opción predeterminada, N, sobre si configurar como una **aplicación de una sola página**. ¡Esto es importante! **No** configures tu proyecto como una aplicación de una sola página.

Después de completar la configuración, asegúrate de que las siguientes propiedades estén configuradas correctamente en tu archivo `firebase.json`. Esto asegura que la renderización del lado del servidor funcione correctamente con Cloud Functions:

```json [firebase.json]
{
  "functions": {
    "source": "dist/analog/server"
  },
  "hosting": [
    {
      "site": "<your_project_id>",
      "public": "dist/analog/public",
      "cleanUrls": true,
      "rewrites": [
        {
          "source": "**",
          "function": "server"
        }
      ]
    }
  ]
}
```

Puedes encontrar más detalles en la [documentación de Firebase](https://firebase.google.com/docs/hosting/quickstart).

### Funciones de Firebase

Asegúrate de configurar las funciones de Firebase como se describe en la sección anterior. Luego, debes [configurar Nitro](overview) correctamente para que las Cloud Functions de Firebase funcionen.

En `vite.config.ts`, actualiza la propiedad `nitro` con las opciones de configuración que se ajusten a tus necesidades, como la versión de Node.js y la región preferida.

```js [vite.config.ts]
nitro: {
  preset: 'firebase',
  firebase: {
    nodeVersion: '20',
    gen: 2,
    httpsOptions: {
      region: 'us-east1',
      maxInstances: 100,
    },
  },
},
```

### Alternativamente, múltiples proyectos AnalogJS (/app1, /app2) en un solo sitio de Firebase Hosting

Esto aprovecha los servicios de Cloud Run para alojar proyectos AnalogJS y utiliza reglas de reescritura para redirigir el tráfico de Firebase a Cloud Run.

[Desplegando con un prefijo de URL personalizado](/docs/features/deployment/overview#deploying-with-a-custom-url-prefix).

```json [firebase.json]
{
  "hosting": [
    {
      "site": "<your_project_id>",
      "public": "public",
      "cleanUrls": true,
      "rewrites": [
        {
          "source": "/app1",
          "run": {
            "serviceId": "app1",
            "region": "us-central1",
            "pinTag": false
          }
        },
        {
          "source": "/app1/**",
          "run": {
            "serviceId": "app1",
            "region": "us-central1",
            "pinTag": false
          }
        }
      ]
    }
  ]
}
```

### Vista previa local

Puedes previsualizar una versión local de tu sitio para probar sin desplegar.

```bash
BUILD_PRESET=firebase npm run build
firebase emulators:start
```

### Desplegar en Firebase Hosting usando la CLI

Para desplegar en Firebase Hosting, ejecuta el comando `firebase deploy`.

```bash
BUILD_PRESET=firebase npm run build
firebase deploy
```

### Advertencias de Firebase

Al configurar o desplegar Firebase, podrías ver advertencias como:

```
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: undefined,
npm WARN EBADENGINE   required: { node: '18' },
npm WARN EBADENGINE   current: { node: 'v20.11.0', npm: '10.2.4' }
npm WARN EBADENGINE }
```

```
 ⚠  functions: Couldn't find firebase-functions package in your source code. Have you run 'npm install'?
```

Estos son errores benignos y pueden ser ignorados, siempre y cuando te asegures de que la configuración de tu entorno coincida con `Nitro`.

## Render.com

Analog soporta el despliegue en [Render](https://render.com/) con configuración mínima.

### Despliegue de Servicio Web

1. [Crea un nuevo Servicio Web](https://dashboard.render.com/select-repo?type=web) y selecciona el repositorio que contiene tu código.

2. Asegúrate de que esté seleccionado el entorno 'Node'.

3. [Especifica tu versión de Node para que Render la use](https://render.com/docs/node-version) (se recomienda v18.13.0 o superior) - Render usa por defecto Node 14, lo cual falla al construir correctamente un sitio Analog.

4. Dependiendo de tu gestor de paquetes, establece el comando de compilación en `yarn && yarn build`, `npm install && npm run build`, o `pnpm i --shamefully-hoist && pnpm build`.

5. Actualiza el comando de inicio a `node dist/analog/server/index.mjs`

6. Haz clic en 'Advanced' y añade una variable de entorno con `BUILD_PRESET` establecida en `render-com`.

7. Haz clic en 'Create Web Service'.

### Despliegue de Sitio Estático

Si usas Analog para pre-renderizar contenido estático, puedes desplegar un sitio estático en Render con configuración mínima.

1. [Crea un nuevo Sitio Estático](https://dashboard.render.com/select-repo?type=static) y selecciona el repositorio que contiene tu código.

2. Dependiendo de tu gestor de paquetes, establece el comando de compilación en `yarn && yarn build`, `npm install && npm run build`, o `pnpm i --shamefully-hoist && pnpm build`.

3. Establece el directorio de publicación en el directorio `public` dentro del directorio de compilación `dist` (por ejemplo, `dist/analog/public`)

4. Haz clic en 'Create Static Site'

## Edgio

Analog soporta el despliegue en [Edgio](https://edg.io) con configuración mínima.

1. Instala la CLI de Edgio:

```bash
npm i -g @edgio/cli
```

2. En el directorio de tu proyecto, inicializa Edgio:

```bash
edgio init --connector=@edgio/analogjs
```

3. Despliega a Edgio

```bash
edgio deploy
```

## GitHub Pages (Despliegue de Sitio Estático)

Analog soporta el despliegue de un sitio estático en [GitHub Pages](https://pages.github.com/).
Al desplegar tu sitio en GitHub Pages, debes añadir un archivo vacío llamado `.nojekyll` en el directorio raíz de la rama `gh-pages`.

Puedes automatizar el despliegue usando la acción [Analog Publish Github Pages](https://github.com/marketplace/actions/analog-publish-github-pages) acción:

```yaml
name: Build and Deploy

on:
  push:
    branches:
      - 'main'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - uses: k9n-dev/analog-publish-gh-pages@v1.0.0
        with:
          access-token: ${{ secrets.ACCESS_TOKEN }}
          # hay más opciones disponibles.
          # ver: https://github.com/marketplace/actions/analog-publish-github-pages
```

O puedes hacerlo tú mismo de la siguiente manera:

```yaml
name: Build Deploy

on:
  push:
    branches:
      - '*' # despliega en todas las ramas (pero se añade una bandera --dry-run para las ramas (ver código abajo))

env:
  TARGET_DIR: dist/analog/public

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - name: Set environment variable based on branch
        run: |
          if [[ $GITHUB_REF == refs/heads/main || $GITHUB_REF == refs/heads/master ]]; then
            echo "Branch is main or master. Setting DRY_RUN_OPTION to empty."
            echo "DRY_RUN_OPTION=" >> $GITHUB_ENV
          else
            echo "Branch is not main or master. Setting DRY_RUN_OPTION to '--dry-run'."
            echo "DRY_RUN_OPTION=--dry-run" >> $GITHUB_ENV
          fi
      - name: Install
        run: npm ci
      - name: Build
        run: npm run build
      - name: Deploy Website (gh-pages branch)
        env:
          GH_TOKEN: ${{ secrets.ACCESS_TOKEN }} # Se debe crear un token para poder desplegar en la rama gh-pages
          CNAME_OPTION: --cname=yourdomain.dev # omitir si no estás ejecutándolo en un dominio personalizado
        run: |
          echo "DRY_RUN_OPTION=$DRY_RUN_OPTION"
          npx angular-cli-ghpages --no-silent --dir="${{env.TARGET_DIR}}" $CNAME_OPTION $DRY_RUN_OPTION
```

## Zerops

Analog soporta el despliegue de aplicaciones estáticas y renderizadas del lado del servidor en [Zerops](https://zerops.io) con un archivo de configuración sencillo.

:::info
Un proyecto de Zerops puede contener múltiples proyectos de Analog. Consulta repositorios de ejemplo para aplicaciones Analog [estáticas](https://github.com/zeropsio/recipe-analog-static) y [renderizadas del lado del servidor](https://github.com/zeropsio/recipe-analog-nodejs) para empezar rápidamente.
:::

### Aplicación Analog Estática (SSG)

Si tu proyecto no está listo para SSG, configura tu proyecto para la [Generación de Sitio Estático](/docs/features/server/static-site-generation).

#### 1. Crea un proyecto en Zerops

Los proyectos y servicios pueden ser añadidos ya sea a través de un asistente de [Agregar Proyecto](https://app.zerops.io/dashboard/project-add) o importados usando una estructura YAML:

```yml
project:
  name: recipe-analog
services:
  - hostname: app
    type: static
```

Esto crea un proyecto llamado `recipe-analog` con un servicio estático de Zerops llamado `app`.

#### 2. Añadir la configuración de zerops.yml

Para indicarle a Zerops cómo construir y ejecutar tu sitio, añade un archivo `zerops.yml` a tu repositorio:

```yml
zerops:
  - setup: app
    build:
      base: nodejs@20
      buildCommands:
        - pnpm i
        - pnpm build
      deployFiles:
        - public
        - dist/analog/public/~
    run:
      base: static
```

#### 3. [Iniciar la tubería de compilación y despliegue](#build-deploy-your-code)

### Aplicación Analog Renderizada del Lado del Servidor (SSR)

Si tu proyecto no está listo para SSR, configura tu proyecto para la [Renderización del Lado del Servidor](/docs/features/server/server-side-rendering).

#### 1. Crea un proyecto en Zerops

Los proyectos y servicios pueden ser añadidos ya sea a través de un asistente de [Agregar Proyecto](https://app.zerops.io/dashboard/project-add) o importados usando una estructura YAML:

```yml
project:
  name: recipe-analog
services:
  - hostname: app
    type: nodejs@20
```

Esto crea un proyecto llamado `recipe-analog` con un servicio de Node.js de Zerops llamado `app`.

#### 2. Añadir la configuración de zerops.yml

Para indicarle a Zerops cómo construir y ejecutar tu sitio, añade un archivo `zerops.yml` a tu repositorio:

```yml
zerops:
  - setup: app
    build:
      base: nodejs@20
      buildCommands:
        - pnpm i
        - pnpm build
      deployFiles:
        - public
        - node_modules
        - dist
    run:
      base: nodejs@20
      ports:
        - port: 3000
          httpSupport: true
      start: node dist/analog/server/index.mjs
```

#### 3. [Iniciar la tubería de compilación y despliegue](#build-deploy-your-code)

---

### Compilar y desplegar tu código

#### Iniciar la tubería conectando el servicio con tu repositorio de GitHub / GitLab

Tu código puede ser desplegado automáticamente en cada commit o una nueva etiqueta conectando el servicio con tu repositorio de GitHub / GitLab. Esta conexión puede ser configurada en el detalle del servicio.

#### Iniciar la tubería usando Zerops CLI (zcli)

También puedes iniciar la tubería manualmente desde tu terminal o tu CI/CD existente usando Zerops CLI.

1. Instala la CLI de Zerops.

```bash
# Para descargar el binario de zcli directamente,
# usa https://github.com/zeropsio/zcli/releases
npm i -g @zerops/zcli
```

2. Abre [Settings > Access Token Management](https://app.zerops.io/settings/token-management) en la aplicación Zerops y genera un nuevo token de acceso.

3. Inicia sesión usando tu token de acceso con el siguiente comando:

```bash
zcli login <token>
```

4. Navega a la raíz de tu aplicación (donde se encuentra `zerops.yml`) y ejecuta el siguiente comando para iniciar el despliegue:

```bash
zcli push
```

#### Iniciar la tubería usando GitHub / Gitlab

También puedes consultar [Integración con GitHub](https://docs.zerops.io/references/github-integration) / [Integración con Gitlab](https://docs.zerops.io/references/gitlab-integration) en [Documentación de Zerops](https://docs.zerops.io/) para la integración con git.
