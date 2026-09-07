# Streaming SSR

Analog supports progressive streaming server-side rendering, flushing the
response to the browser as the app renders instead of buffering the whole
document until it is complete.

The document head is sent immediately, each `@defer (hydrate …)` block is sent
the moment it resolves on the server, and the authoritative document arrives
last, so a slow block never holds back the rest of the page.

Application module assets are preloaded with the shell, but execute only after
the authoritative body is installed. A failed or incomplete stream therefore
shows its error view without starting Angular against a missing application root.

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
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [analog({ experimental: { streaming: true } }), angular(), nitro()],
});
```

Then use `renderStream` instead of `render` in `main.server.ts`:

```ts
// src/main.server.ts
import '@angular/platform-server/init';
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

```xml
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
pending until its data resolves. Its early preview may still show loading state;
the authoritative tail contains the settled data and hydration state.

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
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    analog({
      experimental: { streaming: true },
    }),
    angular(),
    nitro({
      routeRules: {
        '/report': { streaming: false },
      },
    }),
  ],
});
```

An explicit `streaming: true` rule overrides an inherited opt-out. Route policy
comes from the host's matched rules, not caller-provided headers. Cancelling the
response body or aborting the host request disposes the rendering platform and
cancels queued block flushes. Failures after the shell has been sent error the
stream for direct renderer consumers. The native HTTP adapter opts into a generic
failure marker so the browser can show an incomplete-document error; it cannot
change the already-committed HTTP status. Unexpected EOF after the preview
runtime arrives is handled the same way.

## Prerendering

Nitro prerendering always writes the fully buffered document, even when a route
enables streaming. Static HTML therefore contains its final content and hydration
state without requiring the browser to assemble streaming templates. This
prerender-only policy does not disable streaming for request-time rendering.

## Cloudflare Workers

Use zoneless Angular and enable incoming request cancellation in the generated
Worker configuration:

```ts
nitro({
  preset: 'cloudflare-module',
  cloudflare: {
    wrangler: {
      compatibility_flags: ['nodejs_compat', 'enable_request_signal'],
    },
  },
});
```

The native Nitro integration passes Cloudflare's `waitUntil` into the render
context. While a streamed render is pending, the renderer emits a small HTML
comment once per second. Workers observe disconnected clients on a subsequent
write, so a silent data operation must not prevent that notification. The
request lifetime remains held until the Angular platform has been disposed;
completion, failure and cancellation stop the comments and release that lifetime.

Custom edge hosts can supply the optional `ServerContext.waitUntil` callback for
the same handoff. Hosts without it do not emit these comments. This rendering
support does not remove the native server-function dispatcher's requirement for
Node-compatible request and response objects.
