---
sidebar_position: 4
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Integración del Framework Ionic con Analog

Este tutorial te guía a través del proceso de integración del **Ionic Framework** en tu aplicación **Analog** para que puedas aprovechar el poder de los componentes iOS y Android de Ionic en tus aplicaciones.

## Paso 1: Instalar Ionic Framework

Para comenzar, necesitas instalar el paquete `@ionic/angular@latest`. Dependiendo de tu gestor de paquetes preferido, ejecuta uno de los siguientes comandos:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @ionic/angular@latest
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @ionic/angular@latest
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @ionic/angular@latest
```

  </TabItem>
</Tabs>

### Opcional: Instalar Ionic Angular Toolkit para schematics

Ionic también ofrece un conjunto de schematics que pueden ayudarte a crear componentes siguiendo la estructura de Ionic. Puedes agregarlos instalando el paquete `@ionic/angular-toolkit` en tus **devDependencies**.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install -D @ionic/angular-toolkit
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add -D @ionic/angular-toolkit
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -D @ionic/angular-toolkit
```

  </TabItem>
</Tabs>

### Opcional: Instalar Ionicons: Biblioteca de iconos personalizada de Ionic

Ionic también ofrece una biblioteca de iconos que incluye más de 500 iconos para la mayoría de las necesidades de tus aplicaciones móviles. Puedes instalarlos agregando el paquete `ionicons` a tu proyecto:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install ionicons
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add ionicons
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install ionicons
```

  </TabItem>
</Tabs>

## Paso 2: Configurar Ionic Framework en tu aplicación

1. **Actualiza tu archivo `vite.config.ts`** para incluir los paquetes de Ionic en el proceso de **SSR**, agregándolos al array `noExternal`. `ionicons` es necesario solo si instalaste el paquete `ionicons`. Si usas **Vitest**, incluye el paquete `@ionic/angular` para permitir que Vitest compile correctamente ese paquete para Vitest.

   ```ts
   export default defineConfig(({ mode }) => {
     return {
       // ...

       // añade estas líneas
       ssr: {
         noExternal: ['@ionic/**', '@stencil/**', 'ionicons'],
       },

       // ...

       // añade estas líneas si usas Vitest
       test: {
         server: {
           deps: {
             inline: ['@ionic/angular'],
           },
         },
       },
     };
   });
   ```

2. **Agrega en tu `app.config.ts`** el método `provideIonicAngular` y el proveedor `IonicRouteStrategy`.

   ```ts
   import { RouteReuseStrategy, provideRouter } from '@angular/router';
   import {
     IonicRouteStrategy,
     provideIonicAngular,
   } from '@ionic/angular/standalone';

   export const appConfig: ApplicationConfig = {
     providers: [
       provideFileRouter(),
       provideClientHydration(),
       provideHttpClient(withFetch()),
       { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
       provideIonicAngular(),
     ],
   };
   ```

3. **Actualiza tu archivo `app.component.ts`** para establecer en la plantilla las etiquetas Ionic requeridas. Necesitarás consultar la [Advertencia sobre Server Side Rendering](#advertencia-sobre-server-side-rendering) ya que [Ionic aún no soporta la hidratación del cliente](https://github.com/ionic-team/ionic-framework/issues/28625#issuecomment-1843919548).

   ```ts
   import { Component } from '@angular/core';
   import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

   @Component({
     selector: 'demo-root',
     standalone: true,
     imports: [IonApp, IonRouterOutlet],
     template: `<ion-app><ion-router-outlet></ion-router-outlet></ion-app>`,
   })
   export class AppComponent {}
   ```

4. **Renombra el archivo `styles.css` a `styles.scss`.**

5. **Configura la propiedad `inlineStylesExtension`** a `'scss'` en el archivo `vite.config.ts`:

   ```ts
   export default defineConfig(({ mode }) => {
     return {
       plugins: [
         analog({
           vite: {
             inlineStylesExtension: 'scss',
           },
         }),
       ],
     };
   });
   ```

6. **Actualiza el archivo `index.html`** para referenciar el archivo SCSS y para incluir las meta etiquetas requeridas para aplicaciones Ionic:

   ```html
   <head>
     <!-- otros encabezados -->
     <link rel="stylesheet" href="/src/styles.scss" />

     <meta
       name="viewport"
       content="viewport-fit=cover, width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no"
     />
     <meta name="color-scheme" content="light dark" />
     <meta name="format-detection" content="telephone=no" />
     <meta name="msapplication-tap-highlight" content="no" />

     <!-- añadir a la pantalla de inicio para iOS -->
     <meta name="apple-mobile-web-app-capable" content="yes" />
     <meta name="apple-mobile-web-app-status-bar-style" content="black" />
   </head>
   <body>
     <!-- contenido -->
   </body>
   ```

7. **Actualiza el archivo `styles.scss`** para importar los estilos de Ionic y definir tu [tema personalizado](https://ionicframework.com/docs/theming/color-generator):

   ```scss
   /* CSS principal requerido para que los componentes Ionic funcionen correctamente */
   @import '@ionic/angular/css/core.css';

   /* CSS básico para aplicaciones construidas con Ionic */
   @import '@ionic/angular/css/normalize.css';
   @import '@ionic/angular/css/structure.css';
   @import '@ionic/angular/css/typography.css';
   @import '@ionic/angular/css/display.css';

   /* Utilidades CSS opcionales que pueden ser comentadas */
   @import '@ionic/angular/css/padding.css';
   @import '@ionic/angular/css/float-elements.css';
   @import '@ionic/angular/css/text-alignment.css';
   @import '@ionic/angular/css/text-transformation.css';
   @import '@ionic/angular/css/flex-utils.css';

   /**
    * Modo Oscuro de Ionic
    * -----------------------------------------------------
    * Para más información, por favor visita:
    * https://ionicframework.com/docs/theming/dark-mode
    */

   /* @import "@ionic/angular/css/palettes/dark.always.css"; */
   /* @import "@ionic/angular/css/palettes/dark.class.css"; */
   @import '@ionic/angular/css/palettes/dark.system.css';
   ```

### Advertencia sobre Server Side Rendering

El **Ionic Framework** [no soporta la nueva Hidratación del Cliente de Angular](https://github.com/ionic-team/ionic-framework/issues/28625#issuecomment-1843919548), ya que Angular [no soporta SSR con web components](https://github.com/angular/angular/issues/52275), y cuando sean soportados, se deberá trabajar en los componentes de **Stencil** para habilitarlo. Por lo tanto, actualmente hay tres opciones para manejar esto:

1. **Eliminar `provideClientHydration()`** de los proveedores en `app.config.ts`.

   - Esto elimina el nuevo mecanismo de hidratación del cliente de Angular y vuelve al anterior, lo que causará un parpadeo al re-renderizar el DOM desde el cliente.

     ```ts
     import { RouteReuseStrategy, provideRouter } from '@angular/router';
     import {
       IonicRouteStrategy,
       provideIonicAngular,
     } from '@ionic/angular/standalone';

     export const appConfig: ApplicationConfig = {
       providers: [
         provideFileRouter(),
         //provideClientHydration(), // eliminar esto.
         provideHttpClient(withFetch()),
         { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
         provideIonicAngular(),
       ],
     };
     ```

2. **Agregar el atributo `ngSkipHydration`** a la etiqueta `ion-app`.

   - Esto deshabilitará el mecanismo de hidratación del cliente para el elemento `ion-app` y sus hijos, pero continuará usando la hidratación del cliente en otros elementos. Esto también causará un parpadeo en la página para los componentes Ionic. No es muy útil para otros elementos/componentes ya que, con aplicaciones Ionic, todos tus componentes Ionic existen dentro de la etiqueta `ion-app`.

     ```ts
     import { Component } from '@angular/core';
     import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

     @Component({
       selector: 'demo-root',
       standalone: true,
       imports: [IonApp, IonRouterOutlet],
       template: `
         <ion-app ngSkipHydration>
           <ion-router-outlet></ion-router-outlet>
         </ion-app>
       `,
     })
     export class AppComponent {}
     ```

3. **Deshabilitar SSR completamente**

   - Deshabilita SSR en el archivo `vite.config.ts`. Esto **eliminará el parpadeo** pero perderás todos los beneficios de tener SSR en tu aplicación.

     ```ts
     plugins: [
       analog({
         ssr: false,
       }),
     ],
     ```

**Debes** elegir una de las opciones anteriores, ya que no configurar esto hará que tu aplicación lance errores en tiempo de ejecución, como el siguiente:

```js
ERROR Error: NG0500: Durante la hidratación Angular esperaba <ion-toolbar> pero encontró un nodo de comentario.

Angular esperaba este DOM:

  <ion-toolbar color="secondary">…</ion-toolbar>  <-- EN ESTA UBICACIÓN
  …


DOM actual es:

<ion-header _ngcontent-ng-c1775393043="">
  <!--  -->  <-- EN ESTA UBICACIÓN
  …
</ion-header>

Nota: los atributos solo se muestran para representar mejor el DOM pero no afectan a las discrepancias de hidratación.

Para solucionar este problema:
  * revisa el componente "AppComponent" para problemas relacionados con la hidratación
  * verifica si tu plantilla tiene una estructura HTML válida
  * o salta la hidratación agregando el atributo `ngSkipHydration` al nodo host en una plantilla
```

## Paso 3: Agregar Capacitor (Opcional)

**Capacitor** te permite crear aplicaciones web nativas que pueden ejecutarse en dispositivos iOS y Android con facilidad.

### Paso 3.1 Instalar y configurar tu aplicación Capacitor

1. Primero, necesitas instalar los paquetes `@capacitor/core` y `@capacitor/cli`. Dependiendo de tu gestor de paquetes preferido, ejecuta uno de los siguientes comandos:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @capacitor/core
npm install -D @capacitor/cli
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @capacitor/core
yarn add -D @capacitor/cli
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @capacitor/core
pnpm install -D @capacitor/cli
```

  </TabItem>
</Tabs>

2. Luego, debes inicializar el proyecto **Capacitor** con el siguiente comando. La CLI te hará algunas preguntas, comenzando con el nombre de tu aplicación y el ID de paquete que deseas usar para tu aplicación.

   ```shell
   npx cap init
   ```

3. **Actualiza la propiedad `webDir`** en `capacitor.config.ts` para que apunte a la carpeta `dist` de la compilación de Analog.

   ```ts
   import type { CapacitorConfig } from '@capacitor/cli';

   const config: CapacitorConfig = {
     appId: 'com.ionic.capacitor',
     appName: 'ionic-capacitor',
     webDir: 'dist/analog/public',
   };

   export default config;
   ```

### Paso 3.2 Crear tus proyectos Android y iOS

1. Instala los paquetes `@capacitor/android` y/o `@capacitor/ios` según las plataformas que deseas soportar.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @capacitor/android
npm install @capacitor/ios
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @capacitor/android
yarn add @capacitor/ios
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @capacitor/android
pnpm install @capacitor/ios
```

  </TabItem>
</Tabs>

2. **Añade el proyecto Android y/o iOS** a tu aplicación.

   ```shell
   npx cap add android
   npx cap add ios
   ```

3. **Sincroniza los archivos del proyecto** con las plataformas instaladas.

   ```shell
   npx cap sync
   ```

4. **Puedes ejecutar la aplicación** con los siguientes comandos:

   ```shell
   npx cap run android
   npx cap run ios
   ```

---

¡Eso es todo! Has instalado y configurado exitosamente **Ionic Framework** con (o sin) **Capacitor** para tu aplicación **Analog**.
