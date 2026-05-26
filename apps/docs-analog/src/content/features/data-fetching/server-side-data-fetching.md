# Server-Side Data Fetching

Analog supports fetching data from the server before loading a page. This can be achieved by defining an async `load` function in `.server.ts` file of the page.

## Fetching the Data

To fetch the data from the server, create a `.server.ts` file that contains the async `load` function alongside the `.page.ts` file.

```ts
// src/app/pages/index.server.ts
};
```

## Injecting the Data

Accessing the data fetched on the server can be done using the `injectLoad` function provided by `@analogjs/router`.
The `load` function is resolved using Angular route resolvers, so setting `requireSync: false` and `initialValue: {}` offers no advantage, as load is fetched before the component is instantiated.

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

Now to get the data in the component add an input called `load`.

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

## Overriding the Public Base URL

Analog automatically infers the public base URL to be set when using the server-side data fetching through its [Server Request Context](/docs/features/data-fetching/overview#server-request-context) and [Request Context Interceptor](/docs/features/data-fetching/overview#request-context-interceptor). To explcitly set the base URL, set an environment variable, using a `.env` file to define the public base URL.

```
// .env
VITE_ANALOG_PUBLIC_BASE_URL="http://localhost:5173"
```

The environment variable must also be set when building for deployment.
