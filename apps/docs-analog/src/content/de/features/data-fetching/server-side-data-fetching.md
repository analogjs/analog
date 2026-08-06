# Server-seitiger Datenabruf

Analog unterstützt das Abrufen von Daten vom Server vor dem Laden einer Seite. Dies kann durch die Definition einer asynchronen `load`-Funktion in der Datei `.server.ts` der Seite erreicht werden.

## Abrufen der Daten

Um die Daten vom Server zu holen, erstelle eine Datei `.server.ts`, die neben der Datei `.page.ts` die asynchrone Funktion `load` enthält.

```ts
// src/app/pages/index.server.ts
import { PageServerLoad } from '@analogjs/router';

export const load = async ({
  params, // params/queryParams from the request
  req, // H3 Request
  res, // H3 Response handler
  fetch, // internal fetch for direct API calls,
  event, // full request event
}: PageServerLoad) => {
  return {
    loaded: true,
  };
};
```

## Injizieren der Daten

Der Zugriff auf die auf dem Server abgerufenen Daten kann mit der Funktion `injectLoad` erfolgen, die von `@analogjs/router` bereitgestellt wird.

```ts
// src/app/pages/index.page.ts
import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad } from '@analogjs/router';

import { load } from './index.server'; // not included in client build

@Component({
  standalone: true,
  template: `
    <h2>Home</h2>

    Loaded: {{ data().loaded }}
  `,
})
export default class BlogComponent {
  data = toSignal(injectLoad<typeof load>(), { requireSync: true });
}
```

Der Zugriff auf die Daten kann auch mit Component Inputs und Component Input Bindings erfolgen, die in der Angular Router Konfiguration bereitgestellt werden. Um den Angular Router für `Component Input Bindings` zu konfigurieren, füge `withComponentInputBinding()` zu den Argumenten hinzu, die an `provideFileRouter()` in der `app.config.ts` übergeben werden.

```ts
import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { withNavigationErrorHandler } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withComponentInputBinding(),
      withNavigationErrorHandler(console.error),
    ),
    provideHttpClient(),
    provideClientHydration(),
  ],
};
```

Um die Daten in der Komponente zu erhalten, füge nun ein Input mit dem Namen `load` hinzu.

```ts
// src/app/pages/index.page.ts
import { Component } from '@angular/core';
import { LoadResult } from '@analogjs/router';

import { load } from './index.server'; // not included in client build

@Component({
  standalone: true,
  template: `
    <h2>Home</h2>
    Loaded: {{ data.loaded }}
  `,
})
export default class BlogComponent {
  @Input() load(data: LoadResult<typeof load>) {
    this.data = data;
  }

  data!: LoadResult<typeof load>;
}
```

## Zugriff auf die Serverladedaten

Der Zugriff auf die Server-Ladedaten aus dem `RouteMeta`-Resolver kann mit der Funktion `getLoadResolver` erfolgen, die von `@analogjs/router` bereitgestellt wird.

```ts
import { getLoadResolver } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  resolve: {
    data: async (route) => {
      // call server load resolver for this route from another resolver
      const data = await getLoadResolver(route);

      return { ...data };
    },
  },
};
```

## Überschreiben der öffentlichen Basis-URL

Analog ermittelt automatisch die öffentliche Basis-URL, die bei der Verwendung des serverseitigen Datenabrufs über den [Kontext der Serveranfrage](/de/docs/features/data-fetching/overview#kontext-der-serveranfrage) und den [Injektor des Anfragekontext](/de/docs/features/data-fetching/overview#injektor-des-anfragekontext) festgelegt wird. Um die Basis-URL explizit festzulegen, setze eine Umgebungsvariable durch die Verwendung einer `.env`-Datei, um die öffentliche Basis-URL zu definieren.

```
// .env
VITE_ANALOG_PUBLIC_BASE_URL="http://localhost:5173"
```

Die Umgebungsvariable muss auch beim Erstellen der Veröffentlichung gesetzt werden.
