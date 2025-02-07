# Server-Side Data Fetching

Analog supports fetching data from the server before loading a page. This can be achieved by defining an async `load` function in `.server.ts` file of the page.

## Fetching the Data

To fetch the data from the server, create a `.server.ts` file that contains the async `load` function alongside the `.page.ts` file.

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

## Injecting the Data

Accessing the data fetched on the server can be done using the `injectLoad` function provided by `@analogjs/router`.
The `load` function is resolved using Angular route resolvers, so setting `requireSync: false` and `initialValue: {}`
offers no advantage, as load is fetched before the component is instantiated.

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

Accessing the data can also be done with Component Inputs and Component Input Bindings provided in the Angular Router configuration. To configure the Angular Router for `Component Input Bindings`, add `withComponentInputBinding()` to the arguments passed to `provideFileRouter()` in the `app.config.ts`.

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

Now to get the data in the component add an input called `load`.

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

## Accessing to the server load data

Accessing to the server load data from `RouteMeta` resolver can be done using the `getLoadResolver` function provided by `@analogjs/router`.

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

## Overriding the Public Base URL

Analog automatically infers the public base URL to be set when using the server-side data fetching through its [Server Request Context](/docs/features/data-fetching/overview#server-request-context) and [Request Context Interceptor](/docs/features/data-fetching/overview#request-context-interceptor). To explcitly set the base URL, set an environment variable, using a `.env` file to define the public base URL.

```
// .env
VITE_ANALOG_PUBLIC_BASE_URL="http://localhost:5173"
```

The environment variable must also be set when building for deployment.
