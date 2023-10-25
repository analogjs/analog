---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Integración con Angular Material con Analog

Este tutorial te guiará a través del proceso de integración de la librería Angular Material dentro de tu aplicación Analog.

## Paso 1: Instalando la librería Angular Material

Para comenzar, necesitas instalar los paquetes `@angular/cdk` y `@angular/material`. Dependiendo de tu gestor de paquetes preferido, ejecuta uno de los siguientes comandos:

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

## Paso 2: Configurando la librería Angular Material

1. Renombra el archivo `styles.css` a `styles.scss`.
2. Configura la propiedad `inlineStylesExtension` a `'scss'` en el archivo `vite.config.ts`:

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

3. Actualiza el archivo `index.html` para referenciar el archivo SCSS:

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

4. Actualiza el archivo `styles.scss` para importar los estilos de Angular Material y definir tu tema personalizado:

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

## Paso Opcional: Configurando Animaciones

Si deseas (des)activar las animaciones donde sea necesario, sigue estos pasos adicionales:

1. abre el archivo `app.module.ts` y agrega `BrowserAnimationsModule` como un módulo importado

```ts
providers: [
  // other providers
  provideAnimations(),
],
```

2. abre el archivo `app.config.server.ts` y agrega `provideNoopAnimations()` como un proveedor

```ts
providers: [
  // other providers
  provideNoopAnimations(),
],
```

Con estos pasos, has configurado las animaciones para que se activen en el cliente y se desactiven en el servidor en tu aplicación Analog.

Eso es todo! Has instalado y configurado con éxito la librería Angular Material para tu aplicación Analog. Ahora puedes comenzar a utilizar los componentes y estilos de Angular Material en tu proyecto.

Para más información sobre el theming con Angular Material, consulta la [Guía de Theming de Angular Material](https://material.angular.io/guide/theming).
