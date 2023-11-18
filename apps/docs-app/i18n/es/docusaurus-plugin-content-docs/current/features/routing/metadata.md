# Metadata de Rutas

Metadata adicional puede ser agregada a las rutas generadas usando el tipo `RouteMeta`. Aquí es donde se puede definir el título de la página, cualquier guardia necesario, resolvers, providers, y más.

## Definiendo Metadata de Rutas

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

Las rutas pueden ser definidas con el único propósito de redirigir a otra ruta.

Para crear una ruta de redirección, agrega las propiedades `redirectTo` y `pathMatch` al objeto `routeMeta` dentro del fichero de ruta:

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

Los ficheros de rutas de redirección no deben exportar un componente.

:::

Es también posible definir rutas de redirección anidadas. Para la siguiente estructura de ficheros:

```treeview
src/
└── app/
    └── pages/
        └── cities/
            ├── index.page.ts
            ├── new-york.page.ts
            └── san-francisco.page.ts
```

Y la siguiente definición de `routeMeta` en el fichero `src/app/pages/cities/index.page.ts`:

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

## Rutas con Meta Tags

El tipo `RouteMeta` tiene una propiedad `meta` que puede ser usada para definir una lista de meta tags para cada ruta:

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

El ejemplo anterior define el meta tag `<meta http-equiv="refresh" content="30">`, que fuerza al navegador a refrescar la página cada 30 segundos.

Para leer más sobre los posibles meta tags estándar, por favor visita la [documentación](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta) oficial.

## Meta Tags de Open Graph

La propiedad `meta` de arriba también puede ser usada para definir meta tags de OpenGraph para optimizaciones de SEO y aplicaciones sociales:

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

Este ejemplo permitirá que las aplicaciones sociales como Facebook o Twitter muestren títulos, descripciones e imágenes de manera óptima.
