# Enrutamiento

Analog soporta el enrutamiento basado en el sistema de ficheros sobre el enrutador de Angular.

## Definiendo Rutas

Las rutas son definidas usando directorios y ficheros en el directorio `src/app/pages`. Solo los ficheros que terminan con `.page.ts` son recolectados y usados para construir el conjunto de rutas.

:::info

los componentes de rutas **deben** ser definidos como la exportación por defecto y todos los componentes de rutas son **cargados de forma diferida**.

:::

Existen 5 tipos primarios de rutas:

- [Rutas de Índice](#rutas-de-índice)
- [Rutas Estáticas](#rutas-estáticas)
- [Rutas Dinámicas](#rutas-dinámicas)
- [Rutas de Layout](#rutas-de-layout)
- [Rutas Catch-all](#rutas-catch-all)

Estas rutas pueden ser combinadas de diferentes maneras para construir URLs para la navegación.

:::note

En adición a los 5 tipos primarios de rutas, Analog también soporta [Rutas de Redirección](/docs/features/routing/metadata#redirect-routes) y [Rutas de Contenido](/docs/features/routing/content).

:::

## Rutas de Índice

Las rutas de índice son definidas usando el nombre del fichero como la ruta, encerrado en paréntesis.

El ejemplo de ruta abajo en `src/app/pages/(home).page.ts` define una ruta `/`.

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: ` <h2>Welcome</h2> `,
})
export default class HomePageComponent {}
```

:::tip

Las rutas de índice también pueden ser definidas usando `index.page.ts` como el nombre del fichero de la ruta.

:::

## Rutas Estáticas

Las rutas estáticas son definidas usando el nombre del fichero como la ruta.

El ejemplo de ruta abajo en `src/app/pages/about.page.ts` define una ruta `/about`.

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    Analog is a meta-framework on top of Angular.
  `,
})
export default class AboutPageComponent {}
```

Es también posible definir rutas estáticas anidadas de dos maneras diferentes:

1. Anidando los ficheros de rutas en directorios - `src/app/pages/about/team.page.ts` define una ruta `/about/team`.
2. Usando la notación de punto en el nombre del fichero - `src/app/pages/about.team.page.ts` también define una ruta `/about/team`.

### Grupos de Rutas

Las rutas pueden ser agrupadas en el mismo directorio sin añadir un segmento de ruta usando paréntesis.

```treeview
src/
└── app/
    └── pages/
        └── (auth)/
            ├── login.page.ts
            └── signup.page.ts
```

El ejemplo de arriba define las rutas `/login` y `/signup`.

## Rutas Dinámicas

Las ruta dinámicas son definidas usando el nombre del fichero como la ruta, encerrado en corchetes. El parámetro para la ruta es extraído de la ruta.

El ejemplo de ruta abajo en `src/app/pages/[productId].page.ts` define una ruta `/products/:productId`.

```ts
import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  standalone: true,
  imports: [AsyncPipe],
  template: `
    <h2>Product Details</h2>

    ID: {{ productId$ | async }}
  `,
})
export default class ProductDetailsPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly productId$ = this.route.paramMap.pipe(map((params) => params.get('productId')));
}
```

Las rutas dinámicas también pueden ser definidas usando la notación de punto en el nombre del fichero - `src/app/pages/products.[productId].page.ts` define una ruta `/products/:productId`.

### Usando enlaces de entrada del componente de ruta

Si estás utilizando la función `withComponentInputBinding()` con el enrutador de Angular, puedes usar el decorador **Input**, junto con el mismo **nombre del parámetro**, para obtener el parámetro de la ruta.

Primero, añade `withComponentInputBinding()` a los argumentos de la función `provideFileRouter()`.

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideFileRouter } from '@analogjs/router';
import { withComponentInputBinding } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withComponentInputBinding()),
    // other providers
  ],
};
```

A continuación, usa el parámetro de la ruta como una entrada.

```ts
// src/app/pages/products/[productId].page.ts
import { Component, Input } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h2>Product Details</h2>

    ID: {{ productId }}
  `,
})
export default class ProductDetailsPageComponent {
  @Input() productId: string;
}
```

## Rutas de Layout

Las rutas de layout son definidas usando un fichero padre y un directorio hijo con el mismo nombre.

La siguiente estructura abajo representa una ruta de layout.

```treeview
src/
└── app/
    └── pages/
        ├── products/
        │   ├── [productId].page.ts
        │   └── (products-list).page.ts
        └── products.page.ts
```

Esto define dos rutas con un layout compartido:

- `/products`
- `/products/:productId`

The parent `src/app/pages/products.page.ts` file contains the parent page with a router outlet.

```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <h2>Products</h2>

    <router-outlet></router-outlet>
  `,
})
export default class ProductsComponent {}
```

El fichero anidado `src/app/pages/products/[productId].page.ts` contiene la página de detalles `/products/:productId`.

```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: ` <h2>Products List</h2> `,
})
export default class ProductsListComponent {}
```

El fichero anidado `src/app/pages/products/[productId].page.ts` contiene la página de detalles `/products/:productId`.

```ts
import { Component, inject } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  standalone: true,
  imports: [AsyncPipe, JsonPipe],
  template: `
    <h2>Product Details</h2>

    ID: {{ productId$ | async }}
  `,
})
export default class ProductDetailsPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly productId$ = this.route.paramMap.pipe(map((params) => params.get('productId')));
}
```

### Rutas de Layout sin Directorio

Las rutas de layout también pueden ser definidas sin añadir un segmento representando el directorio.

```treeview
src/
└── app/
    └── pages/
        ├── (auth)/
        │   ├── login.page.ts
        │   └── signup.page.ts
        └── (auth).page.ts
```

El siguiente ejemplo define las rutas `/login` y `/signup` con un layout compartido. El fichero padre `src/app/pages/(auth).page.ts` contiene la página padre con un router outlet.

## Rutas Catch-all

Las rutas catch-all son definidas usando el nombre del fichero como la ruta, encerrado en corchetes. El parámetro para la ruta es extraído de la ruta.

El ejemplo de ruta abajo en `src/app/pages/[...page-not-found].page.ts` define una ruta `**`. Esta ruta es usualmente para páginas 404.

```ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h2>Page Not Found</h2>

    <a routerLink="/">Go Back Home</a>
  `,
})
export default class PageNotFoundComponent {}
```

Las rutas Catch-all también pueden ser definidas como rutas anidadas.

## Usando todo junto

Para la siguiente estructura de ficheros:

```treeview
src/
└── app/
    └── pages/
        ├── (auth)/
        │   ├── login.page.ts
        │   └── signup.page.ts
        ├── (marketing)/
        │   ├── about.md
        │   └── contact.md
        ├── products/
        │   ├── (product-list).page.ts
        │   ├── [productId].edit.page.ts
        │   └── [productId].page.ts
        ├── (auth).page.ts
        ├── (home).page.ts
        ├── [...not-found].md
        └── products.page.ts
```

El enrutador basado en el sistema de ficheros generará las siguientes rutas:

| Directorio         | Página                                                           |
| ------------------ | ---------------------------------------------------------------- |
| `/`                | `(home).page.ts`                                                 |
| `/about`           | `(marketing)/about.md`                                           |
| `/contact`         | `(marketing)/contact.md`                                         |
| `/login`           | `(auth)/login.page.ts` (layout: `(auth).page.ts`)                |
| `/signup`          | `(auth)/signup.page.ts` (layout: `(auth).page.ts`)               |
| `/products`        | `products/(product-list).page.ts` (layout: `products.page.ts`)   |
| `/products/1`      | `products/[productId].page.ts` (layout: `products.page.ts`)      |
| `/products/1/edit` | `products/[productId].edit.page.ts` (layout: `products.page.ts`) |
| `/unknown-url`     | `[...not-found].md`                                              |
