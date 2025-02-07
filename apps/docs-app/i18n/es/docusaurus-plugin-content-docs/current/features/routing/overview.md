# Enrutamiento

Analog soporta el enrutamiento basado en el sistema de archivos sobre el Angular Router.

## Definiendo Rutas

Las rutas se definen usando carpetas y archivos en la carpeta `src/app/pages`. Solo se recopilan y utilizan archivos que terminen con `.page.ts` para construir el conjunto de rutas.

:::info

Los componentes de ruta **deben** estar definidos como la exportación predeterminada y todos los componentes de ruta son **cargados de forma diferida**.

:::

Hay 5 tipos principales de rutas:

- [Rutas de Índice](#index-routes)
- [Rutas Estáticas](#static-routes)
- [Rutas Dinámicas](#dynamic-routes)
- [Rutas de Layout](#layout-routes)
- [Rutas Catch-all](#catch-all-routes)

Estas rutas pueden combinarse de diferentes maneras para construir URLs para la navegación.

:::note

Además de los 5 tipos principales de rutas, Analog también soporta [Rutas de Redirección](/docs/features/routing/metadata#redirect-routes) y [Rutas de Contenido](/docs/features/routing/content).

:::

## Rutas de Índice

Las rutas de índice se definen usando el nombre del archivo como la ruta encerrada en paréntesis.

El ejemplo de ruta a continuación en `src/app/pages/(home).page.ts` define una ruta `/`.

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: ` <h2>Welcome</h2> `,
})
export default class HomePageComponent {}
```

:::tip

Las rutas de índice también pueden definirse usando `index.page.ts` como el nombre del archivo de ruta.

:::

## Rutas Estáticas

Las rutas estáticas se definen usando el nombre del archivo como la ruta.

El ejemplo de ruta a continuación en `src/app/pages/about.page.ts` define una ruta `/about`.

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

También es posible definir rutas estáticas anidadas de dos maneras diferentes:

1. Anidando los archivos de ruta en carpetas - `src/app/pages/about/team.page.ts` define una ruta `/about/team`.
2. Usando la notación de puntos en el nombre del archivo - `src/app/pages/about.team.page.ts` también define una ruta `/about/team`.

### Grupos de Rutas

Las rutas pueden agruparse en la misma carpeta sin añadir un segmento de ruta agregando el nombre de la carpeta entre paréntesis.

```treeview
src/
└── app/
    └── pages/
        └── (auth)/
            ├── login.page.ts
            └── signup.page.ts
```

El ejemplo anterior define las rutas `/login` y `/signup`.

## Rutas Dinámicas

Las rutas dinámicas se definen usando el nombre del archivo como la ruta encerrada en corchetes. El parámetro para la ruta se extrae del camino de la ruta.

El ejemplo de ruta a continuación en `src/app/pages/products/[productId].page.ts` define una ruta `/products/:productId`.

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

  readonly productId$ = this.route.paramMap.pipe(
    map((params) => params.get('productId')),
  );
}
```

Las rutas dinámicas también pueden definirse usando la notación de puntos en el nombre del archivo - `src/app/pages/products.[productId].page.ts` define una ruta `/products/:productId`.

### Usando Enlaces de Entrada de Componentes de Ruta

Si estás usando la característica `withComponentInputBinding()` con el Angular Router, puedes usar el decorador **Input**, junto con el mismo **nombre de parámetro** para obtener el parámetro de ruta.

Primero, añade `withComponentInputBinding()` a los argumentos de la función `provideFileRouter()`.

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideFileRouter } from '@analogjs/router';
import { withComponentInputBinding } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withComponentInputBinding()),
    // otros proveedores
  ],
};
```

Luego, usa el parámetro de ruta como una entrada.

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

Las rutas de layout se definen usando un archivo padre y una carpeta hija con el mismo nombre.

La siguiente estructura representa una ruta de layout.

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

El archivo padre `src/app/pages/products.page.ts` contiene la página padre con un router outlet.

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

El archivo anidado `src/app/pages/products/(products-list).page.ts` contiene la página de lista `/products`.

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: ` <h2>Products List</h2> `,
})
export default class ProductsListComponent {}
```

El archivo anidado `src/app/pages/products/[productId].page.ts` contiene la página de detalles `/products/:productId`.

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

  readonly productId$ = this.route.paramMap.pipe(
    map((params) => params.get('productId')),
  );
}
```

### Rutas de Layout sin Ruta

Las rutas de layout también pueden definirse sin añadir un segmento de ruta.

```treeview
src/
└── app/
    └── pages/
        ├── (auth)/
        │   ├── login.page.ts
        │   └── signup.page.ts
        └── (auth).page.ts
```

El ejemplo anterior define las rutas `/login` y `/signup` con un layout compartido. El archivo padre `src/app/pages/(auth).page.ts` contiene la página padre con un router outlet.

## Rutas Catch-all

Las rutas catch-all se definen usando el nombre del archivo como la ruta prefijada con 3 puntos encerrados en corchetes.

El ejemplo de ruta a continuación en `src/app/pages/[...page-not-found].page.ts` define una ruta comodín `**`. Esta ruta generalmente es para páginas 404.

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

Las rutas catch-all también pueden definirse como rutas hijas anidadas.

## Integrando Todo

Para la siguiente estructura de archivos:

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

El enrutador basado en el sistema de archivos generará las siguientes rutas:

| Ruta               | Página                                                           |
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
