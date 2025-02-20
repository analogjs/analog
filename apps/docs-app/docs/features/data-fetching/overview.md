# Overview

Data fetching in Analog builds on top of concepts in Angular, such as using `HttpClient` for making API requests.

## Using HttpClient

Using `HttpClient` is the recommended way to make API requests for internal and external endpoints. The context for the request is provided by the `provideServerContext` function for any request that uses `HttpClient` and begins with a `/`.

## Server Request Context

On the server, use the `provideServerContext` function from the Analog router in the `main.server.ts`.

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
  serverContext: ServerContext,
) {
  const html = await renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [provideServerContext(serverContext)],
  });

  return html;
}
```

This provides the `Request` and `Response`, and `Base URL` from the server and registers them as providers that can be injected and used.

## Injection Functions

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

## Request Context Interceptor

Analog also provides `requestContextInterceptor` for the HttpClient that handles transforming any request to URL beginning with a `/` to a full URL request on the server, client, and during prerendering.

Use it with the `withInterceptors` function from the `@angular/common/http` packages.

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
      withInterceptors([requestContextInterceptor]),
    ),
    provideClientHydration(),
  ],
};
```

> Make sure the `requestContextInterceptor` is **last** in the array of interceptors.

## Making Requests

In your component/service, use `HttpClient` along with [/docs/features/api/overview](API routes) with providing a full URL.

An example API route that fetches todos.

```ts
// src/server/routes/v1/todos.ts -> /api/v1/todos
import { eventHandler } from 'h3';

export default eventHandler(async () => {
  const response = await fetch('https://jsonplaceholder.typicode.com/todos');
  const todos = await response.json();

  return todos;
});
```

An example service that fetches todos from the API endpoint.

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

Data requests also use Angular's `TransferState` to store any requests made during Server-Side Rendering, and are transferred to prevent an additional request during the initial client-side hydration.
