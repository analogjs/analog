# Routen-Metadaten

Zusätzliche Metadaten, die der generierten Routenkonfiguration für jede Route hinzugefügt werden können, können mit dem Typ `RouteMeta` erstellt werden. Hier können der Seitentitel, alle notwendigen Guards, Resolver, Provider und mehr definiert werden.

## Definieren von Routen-Metadaten

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

## Umleitungsrouten

Routen können nur zu dem Zweck definiert werden, auf eine andere Route umzuleiten.

Um eine Umleitungsroute zu erstellen, füge die Eigenschaften `redirectTo` und `pathMatch` zum Objekt `routeMeta` in der Routendatei hinzu:

```ts
// src/app/pages/index.page.ts
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  redirectTo: '/home',
  pathMatch: 'full',
};
```

Das obige Beispiel ist eine Umleitung von der Route `/` zur Route `/home`.

:::tip

Umleitungsrouten-Dateien sollten keine Komponente exportieren.

:::

Es ist auch möglich, verschachtelte Umleitungsrouten zu definieren. Für die folgende Dateistruktur:

```treeview
src/
└── app/
    └── pages/
        └── cities/
            ├── index.page.ts
            ├── new-york.page.ts
            └── san-francisco.page.ts
```

Und die folgende `routeMeta`-Definition in der Datei `src/app/pages/cities/index.page.ts`:

```ts
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  redirectTo: '/cities/new-york',
  pathMatch: 'full',
};
```

Leitet `/cities` zu `/cities/new-york` weiter.

:::note

Verschachtelte Weiterleitungen erfordern immer einen absoluten Pfad.

:::

## Routen-Meta-Tags

Der Typ `RouteMeta` hat eine Eigenschaft `meta`, die dazu verwendet werden kann, eine Liste von Meta-Tags für jede Route zu definieren:

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

Das obige Beispiel setzt den Meta-Tag `<meta http-equiv="refresh" content="30">`, der den Browser zwingt, die Seite alle 30 Sekunden zu aktualisieren.

Weitere Informationen über mögliche Standard-Meta-Tags findest du in der offiziellen [Dokumentation] (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta).

## Open-Graph-Meta-Tags

Die oben genannte Eigenschaft `meta` kann auch verwendet werden, um OpenGraph-Meta-Tags für SEO- und Social-Apps-Optimierungen zu definieren:

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

Dieses Beispiel ermöglicht es sozialen Anwendungen wie Facebook oder Twitter, Titel, Beschreibungen und Bilder optimal anzuzeigen.
