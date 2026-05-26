# Routing

Analog unterstützt dateisystembasiertes Routing auf der Grundlage des Angular Routers.

## Routen definieren

Routen werden mit Hilfe von Ordnern und Dateien im Ordner `src/app/pages` definiert. Nur Dateien, die mit `.page.ts` enden, werden gesammelt und zum Aufbau der Routen verwendet.

:::info

Routenkomponenten **müssen** als Standardexport definiert werden, und alle Routenkomponenten sind **lazy-loaded**.

:::

Es gibt 5 Hauptarten von Routen:

- [Index Routen](#index-routen)
- [Statische Routen](#statische-routen)
- [Dynamische Routen](#dynamische-routen)
- [Layout Routen](#layout-routen)
- [Sammelrouten](#sammelrouten)

Diese Routen können auf unterschiedliche Weise kombiniert werden, um URLs für die Navigation zu erstellen.

:::note

Zusätzlich zu den 5 primären Arten von Routen unterstützt Analog auch [Umleitungsrouten](/de/docs/features/routing/metadata#umleitungsrouten) und [Inhaltliche Routen](/de/docs/features/routing/content).

:::

## Index Routen

Index Routen werden definiert, indem der Dateiname als Routenpfad in Klammern angegeben wird.

Die Beispielroute unten in `src/app/pages/(home).page.ts` definiert eine `/`-Route.

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: ` <h2>Welcome</h2> `,
})
export default class HomePageComponent {}
```

:::tip

Index-Routen können auch durch die Verwendung von `index.page.ts` als Routendateiname definiert werden.

:::

## Statische Routen

Statische Routen werden durch die Verwendung des Dateinamens als Routenpfad definiert.

Die Beispielroute unten in `src/app/pages/about.page.ts` definiert eine `/about`-Route.

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

Es ist auch möglich, verschachtelte statische Routen auf zwei verschiedene Arten zu definieren:

1. Durch Verschachtelung der Routendateien in Ordnern - `src/app/pages/about/team.page.ts` definiert eine `/about/team` Route.
2. Durch die Verwendung der Punktnotation im Dateinamen - `src/app/pages/about.team.page.ts` definiert auch eine `/about/team` Route.

### Routengruppen

Routen können im selben Ordner gruppiert werden, ohne dass ein Routenpfadsegment hinzugefügt wird, indem ein Ordnername in Klammern gesetzt wird.

```treeview
src/
└── app/
    └── pages/
        └── (auth)/
            ├── login.page.ts
            └── signup.page.ts
```

Das obige Beispiel definiert die Routen `/login` und `/signup`.

## Dynamische Routen

Dynamische Routen werden definiert, indem der Dateiname als Routenpfad in eckigen Klammern verwendet wird. Der Parameter für die Route wird aus dem Routenpfad extrahiert.

Die folgende Beispielroute in `src/app/pages/products/[productId].page.ts` definiert eine `/products/:productId`-Route.

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

Dynamische Routen können auch mit der Punktnotation im Dateinamen definiert werden - `src/app/pages/products.[productId].page.ts` definiert eine Route `/products/:productId`.

### Verwendung von Route Component Input Bindings

Wenn die Funktion `withComponentInputBinding()` mit dem Angular Router verwendet wird, kann der **Input** Dekorator zusammen mit dem gleichen **Parameternamen** verwenden, um den Routenparameter zu erhalten.

Fügen zunächst die Option `withComponentInputBinding()` zu den Argumenten für die Funktion `provideFileRouter()` hinzu.

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

Als nächstes verwende den Routenparameter als Eingabe.

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

## Layout Routen

Layout-Routen werden mit Hilfe einer übergeordneten Datei und eines untergeordneten Ordners mit demselben Namen definiert.

Die folgende Struktur stellt eine Layout-Route dar.

```treeview
src/
└── app/
    └── pages/
        ├── products/
        │   ├── [productId].page.ts
        │   └── (products-list).page.ts
        └── products.page.ts
```

Damit werden zwei Routen mit einem gemeinsamen Layout definiert:

- `/products`
- `/products/:productId`

Die übergeordnete Datei `src/app/pages/products.page.ts` enthält die übergeordnete Seite mit einem `router-outlet`.

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

Die verschachtelte Datei `src/app/pages/products/(products-list).page.ts` enthält die Listenseite `/products`.

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: ` <h2>Products List</h2> `,
})
export default class ProductsListComponent {}
```

Die verschachtelte Datei `src/app/pages/products/[productId].page.ts` enthält die Detailseite `/products/:productId`.

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

### Pfadlose Layout-Routen

Layout-Routen können auch definiert werden, ohne dass ein Routenpfadsegment hinzugefügt wird.

```treeview
src/
└── app/
    └── pages/
        ├── (auth)/
        │   ├── login.page.ts
        │   └── signup.page.ts
        └── (auth).page.ts
```

Das obige Beispiel definiert die Routen `/login` und `/signup` mit einem gemeinsamen Layout. Die übergeordnete Datei `src/app/pages/(auth).page.ts` enthält die übergeordnete Seite mit einem `router-outlet`.

## Sammelrouten

Sammelrouten werden definiert, indem der Dateiname als Routenpfad mit 3 Punkten in eckigen Klammern vorangestellt wird.

Die Beispielroute unten in `src/app/pages/[...page-not-found].page.ts` definiert eine Platzhalterroute `**`. Diese Route wird normalerweise für 404-Seiten verwendet.

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

Sammelrouten können auch als verschachtelte Child-Routen definiert werden.

## Alles zusammengefügt

Für die folgende Dateistruktur:

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

Werden die folgenden Routen durch den dateisystembasierte Router erzeugt:

| Pfad               | Seite                                                            |
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
