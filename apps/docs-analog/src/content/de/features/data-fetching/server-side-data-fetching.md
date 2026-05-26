# Server-seitiger Datenabruf

Analog unterstützt das Abrufen von Daten vom Server vor dem Laden einer Seite. Dies kann durch die Definition einer asynchronen `load`-Funktion in der Datei `.server.ts` der Seite erreicht werden.

## Abrufen der Daten

Um die Daten vom Server zu holen, erstelle eine Datei `.server.ts`, die neben der Datei `.page.ts` die asynchrone Funktion `load` enthält.

```ts
// src/app/pages/index.server.ts
};
```

## Injizieren der Daten

Der Zugriff auf die auf dem Server abgerufenen Daten kann mit der Funktion `injectLoad` erfolgen, die von `@analogjs/router` bereitgestellt wird.

```ts
// src/app/pages/index.page.ts
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
