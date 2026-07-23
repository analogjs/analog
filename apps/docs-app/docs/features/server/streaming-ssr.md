# Streaming SSR

Analog supports progressive streaming server-side rendering, flushing the
response to the browser as the app renders instead of buffering the whole
document until it is complete.

The document head is sent immediately, each `@defer (hydrate …)` block is sent
the moment it resolves on the server, and the authoritative document arrives
last — so a slow block never holds back the rest of the page.

:::info Experimental

Streaming SSR is experimental and opt-in. It requires **Angular 21 or later**
and builds on [incremental hydration](https://angular.dev/guide/incremental-hydration).
The default buffered [Server Side Rendering](/docs/features/server/server-side-rendering)
path is unchanged.

:::

## Enabling streaming

Enable the `experimental.streaming` option in your Vite config:

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [analog({ experimental: { streaming: true } })],
});
```

Then use `renderStream` instead of `render` in `main.server.ts`:

```ts
// src/main.server.ts
import { renderStream } from '@analogjs/router/server';
import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

export default renderStream(AppComponent, config);
```

Streaming builds on incremental hydration, so enable it in your client
providers. On Angular 21 use `withIncrementalHydration()`; on Angular 22+ it is
enabled by default with `provideClientHydration()`:

```ts
// src/app/app.config.ts
import {
  provideClientHydration,
  withIncrementalHydration,
} from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(withIncrementalHydration()),
    // ...
  ],
};
```

## Streaming deferred blocks

Content that should stream progressively goes in a `@defer` block with a
`hydrate` trigger. Each block is rendered eagerly on the server, streamed as it
resolves, and hydrated on the client when its trigger fires:

```markup
<h1>Dashboard</h1>

@defer (hydrate on immediate) {
  <app-activity-feed />
} @placeholder {
  <p>Loading activity…</p>
}

@defer (hydrate on viewport) {
  <app-recommendations />
} @placeholder {
  <p>Loading recommendations…</p>
}
```

A block backed by asynchronous data (for example an
[`httpResource`](https://angular.dev/guide/http/http-resource)) keeps the render
pending until its data resolves, so the block streams with its final content and
the page's time-to-first-byte is unaffected.

## Title and meta

Because the document head is flushed before the app renders, a title or meta set
during render (via the `Title`/`Meta` services or route metadata) is applied to
the streamed document once the render completes, before hydration runs. Search
engine crawlers are served a buffered render with a fully resolved head instead
of the streamed shell.

## Opting a route out of streaming

Disable streaming for specific routes with a `streaming: false` route rule, the
same way `ssr: false` disables SSR. Matching routes fall back to a buffered
render (no streaming, but SSR and hydration still work):

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    analog({
      experimental: { streaming: true },
      nitro: {
        routeRules: {
          '/report': { streaming: false },
        },
      },
    }),
  ],
});
```
