# Übersicht

Das Abrufen von Daten in Analog baut auf Konzepten in Angular auf, wie z. B. der Verwendung von `HttpClient` für API-Anfragen.

## Verwendung des HttpClient

Die Verwendung von `HttpClient` ist der empfohlene Weg, um API-Anforderungen für interne und externe Endpunkte zu stellen. Der Kontext für die Anforderung wird von der Funktion `provideServerContext` für jede Anforderung bereitgestellt, die `HttpClient` verwendet und mit „/“ beginnt.

## Kontext der Serveranfrage

Verwende auf dem Server verwenden die Funktion `provideServerContext` aus dem Analog-Router in der Datei `main.server.ts`.

```ts
import 'zone.js/node';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';

// Analog server context
import { provideServerContext } from '@analogjs/router/server';
import { ServerContext } from '@analogjs/router/tokens';

import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

if (import.meta.env.PROD) {
  enableProdMode();
}

export function bootstrap() {
  return bootstrapApplication(AppComponent, config);
}

export default async function render(
  url: string,
  document: string,
  serverContext: ServerContext
) {
  const html = await renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [provideServerContext(serverContext)],
  });

  return html;
}
```

Diese stellt den `Request` und `Response` sowie die `Base URL` vom Server bereit und registriert sie als Anbieter, die injiziert und verwendet werden können.

## Injektionsfunktionen

```ts
import { inject } from '@angular/core';
import {
  injectRequest,
  injectResponse,
  injectBaseURL,
} from '@analogjs/router/tokens';

class MyService {
  request = injectRequest(); // <- Server Request Object
  response = injectResponse(); // <- Server Response Object
  baseUrl = injectBaseURL(); // <-- Server Base URL
}
```

## Abfänger für den Anfragekontext

Analog bietet auch `requestContextInterceptor` für den HttpClient, der die Umwandlung jeder URL-Anfrage, die mit einem `/` beginnt, in eine vollständige URL-Anfrage auf dem Server, dem Client und während des Prerenderings übernimmt.

Verwende es mit der Funktion `withInterceptors` aus den Paket `@angular/common/http`.

```ts
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFileRouter, requestContextInterceptor } from '@analogjs/router';
import { withNavigationErrorHandler } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withNavigationErrorHandler(console.error)),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor])
    ),
    provideClientHydration(),
  ],
};
```

> Stelle sicher, dass der `requestContextInterceptor` der **letzte** im Array der Interceptoren ist.

## Anfragen erstellen

Verwende in der Komponente/dem Dienst `HttpClient` zusammen mit [/de/docs/features/api/overview](API-Routen) mit einer vollständige URL.

Eine Beispiel-API-Route, die ToDos abruft.

```ts
// src/server/routes/v1/todos.ts -> /api/v1/todos
import { eventHandler } from 'h3';

export default eventHandler(async () => {
  const response = await fetch('https://jsonplaceholder.typicode.com/todos');
  const todos = await response.json();

  return todos;
});
```

Ein Beispieldienst, der ToDos vom API-Endpunkt abruft.

```ts
// todos.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Todo } from './todos';

@Injectable({
  providedIn: 'root',
})
export class TodosService {
  http = inject(HttpClient);

  getAll() {
    return this.http.get<Todo[]>('/api/v1/todos');
  }

  getData() {
    return this.http.get<Todo[]>('/assets/data.json');
  }
}
```

Datenanfragen verwenden auch Angulars `TransferState`, um alle Anfragen zu speichern, die während des serverseitigen Renderings gemacht wurden, und werden übertragen, um eine zusätzliche Anfrage während der anfänglichen clientseitigen Hydration zu verhindern.
