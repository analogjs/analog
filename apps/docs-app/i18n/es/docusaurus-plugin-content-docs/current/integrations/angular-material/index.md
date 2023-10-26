---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Integración de Angular Material con Analog

Este tutorial te guiará a través del proceso de integrar la biblioteca Angular Material en tu aplicación de Analog.

## Paso 1: Instalación de la biblioteca Angular Material

Para comenzar, instala los paquetes `@angular/cdk` y `@angular/material`. Ejecuta el comando correspondiente a tu gestor de paquetes preferido:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @angular/cdk @angular/material
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @angular/cdk @angular/material
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @angular/cdk @angular/material
```

  </TabItem>
</Tabs>

## Paso 2: Configuración de la biblioteca Angular Material

1. Renombra el fichero `styles.css` a `styles.scss`.
2. Establece la propiedad `inlineStylesExtension` a `'scss'` ien el fichero `vite.config.ts`:

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

3. Actualiza el `index.html` para referenciar el nuevo fichero SCSS:

```html
<head>
  <!-- other headers -->
  <link rel="stylesheet" href="/src/styles.scss" />
  <link rel="preconnect" href="https://fonts.gstatic.com" />
  <link
    href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap"
    rel="stylesheet"
  />
  <link
    href="https://fonts.googleapis.com/icon?family=Material+Icons"
    rel="stylesheet"
  />
</head>
<body class="mat-typography">
  <!-- content -->
</body>
```

4. Actualiza el fichero `styles.scss` para importar los estilos de Angular Material y definir tu tema visual personalizado:

```scss
@use '@angular/material' as mat;
@include mat.core();

$analog-primary: mat.define-palette(mat.$indigo-palette);
$analog-accent: mat.define-palette(mat.$pink-palette, A200, A100, A400);
$analog-warn: mat.define-palette(mat.$red-palette);
$analog-theme: mat.define-light-theme(
  (
    color: (
      primary: $analog-primary,
      accent: $analog-accent,
      warn: $analog-warn,
    ),
  )
);

@include mat.all-component-themes($analog-theme);
```

## Paso Opcional: Configuración de Animaciones

Si deseas activar o desactivar animaciones donde sea necesario, sigue los pasos correspondientes:

1. Abre el fichero `app.config.ts` y declara el proveedor `provideAnimations()`

```ts
providers: [
  // other providers
  provideAnimations(),
],
```

2. Abre el fichero `app.config.server.ts` y declara el proveedor `provideNoopAnimations()`

```ts
providers: [
  // other providers
  provideNoopAnimations(),
],
```

Con estos pasos, has configurado las animaciones para que estén habilitadas en el cliente y deshabilitadas en el servidor en tu aplicación de Analog.

¡Eso es todo! Has instalado y configurado con éxito la biblioteca Angular Material para tu aplicación de Analog. Ahora puedes comenzar a utilizar los componentes y estilos de Angular Material en tu proyecto.

Para más información sobre la creación de temas visuales con Angular Material, consulta la [Guía de Temas de Angular Material.](https://material.angular.io/guide/theming).
