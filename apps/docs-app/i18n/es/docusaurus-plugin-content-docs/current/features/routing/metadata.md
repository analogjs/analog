# Metadatos de Ruta

Los metadatos adicionales para agregar a la configuración de ruta generada para cada ruta se pueden hacer usando el tipo `RouteMeta`. Aquí es donde puedes definir el título de la página, cualquier guardia necesaria, resolvers, providers y más.

## Definiendo Metadatos de Ruta

```ts
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';

import { AboutService } from './about.service';

export const routeMeta: RouteMeta = {
  title: 'About Analog',
  canActivate: [() => true],
  providers: [AboutService],
};

@Component({
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    Analog is a meta-framework on top of Angular.
  `,
})
export default class AboutPageComponent {
  private readonly service = inject(AboutService);
}
```

## Rutas de Redirección

Las rutas pueden definirse con el único propósito de redirigir a otra ruta.

Para crear una ruta de redirección, añade las propiedades `redirectTo` y `pathMatch` al objeto `routeMeta` dentro del archivo de ruta:

```ts
// src/app/pages/index.page.ts
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  redirectTo: '/home',
  pathMatch: 'full',
};
```

El ejemplo anterior es una redirección desde la ruta `/` a la ruta `/home`.

:::tip

Los archivos de rutas de redirección no deben exportar un componente.

:::

También es posible definir rutas de redirección anidadas. Para la siguiente estructura de archivos:

```treeview
src/
└── app/
    └── pages/
        └── cities/
            ├── index.page.ts
            ├── new-york.page.ts
            └── san-francisco.page.ts
```

y la siguiente definición de `routeMeta` en el archivo `src/app/pages/cities/index.page.ts`:

```ts
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  redirectTo: '/cities/new-york',
  pathMatch: 'full',
};
```

Navegar a `/cities` redirige a `/cities/new-york`.

:::note

Las redirecciones anidadas siempre requieren una ruta absoluta.

:::

## Metatags de Ruta

El tipo `RouteMeta` tiene una propiedad `meta` que puede usarse para definir una lista de metatags para cada ruta:

```ts
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';

import { AboutService } from './about.service';

export const routeMeta: RouteMeta = {
  title: 'Refresh every 30 sec',
  meta: [
    {
      httpEquiv: 'refresh',
      content: '30',
    },
  ],
};

@Component({
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    See you again in 30 seconds.
  `,
})
export default class RefreshComponent {}
```

El ejemplo anterior establece la etiqueta meta `<meta http-equiv="refresh" content="30">`, lo que fuerza al navegador a refrescar la página cada 30 segundos.

Para leer más sobre posibles metatags estándar, por favor visita la [documentación oficial](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta).

## Metatags de Open Graph

La propiedad `meta` anterior también puede usarse para definir metatags de OpenGraph para optimizaciones de SEO y aplicaciones sociales:

```ts
export const routeMeta: RouteMeta = {
  meta: [
    {
      name: 'description',
      content: 'Description of the page',
    },
    {
      name: 'author',
      content: 'Analog Team',
    },
    {
      property: 'og:title',
      content: 'Title of the page',
    },
    {
      property: 'og:description',
      content: 'Some catchy description',
    },
    {
      property: 'og:image',
      content: 'https://somepage.com/someimage.png',
    },
  ],
};
```

Este ejemplo permitirá que aplicaciones sociales como Facebook o Twitter muestren títulos, descripciones e imágenes de manera óptima.
