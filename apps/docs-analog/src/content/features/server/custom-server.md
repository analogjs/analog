# Custom Server

Serve an Analog app from your own server entry instead of Nitro: a [Fetchable](https://fetchable.org) module that platforms and runtimes invoke directly, or a server built with a framework such as Hono, Express, NestJS or Fastify. Your entry owns its routes, and Analog handles server-side rendering, page endpoints and server functions inside it. A platform or runtime runs a Fetchable entry, while a Node server entry starts its own process.

:::info

A custom server runs on Node.js (or a runtime with `node:http`, such as Bun or Deno). Prerendering, static site generation and deployment presets come from Nitro, so they aren't available with a custom server.

:::

## Setup

Install `h3`, which Analog's request handling uses (Nitro apps get it from Nitro):

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install h3
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add h3
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm add h3
```

  </TabItem>
</Tabs>

Point the `server` option at your server entry, and leave `nitro()` out of the Vite plugins:

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [analog({ server: { entry: 'src/server/main.ts' } }), angular()],
});
```

Vite compiles the TypeScript in the entry's directory. Frameworks that use decorators with dependency injection, like NestJS, also need `experimentalDecorators` and `emitDecoratorMetadata` in `tsconfig.json`. Vite 8 emits the decorator metadata; on Vite 6 and 7, esbuild can't, so compile the server directory with SWC (for example with `unplugin-swc`).

## The server entry

The entry is a [Fetchable](https://fetchable.org) module: its default export has a `fetch(request)` method that returns a `Response`. `createAnalogRequestHandler()` handles Analog's requests and returns `null` for anything else:

```ts
// src/server/main.ts
import { createAnalogRequestHandler } from '@analogjs/router/server';

const handleAnalogRequest = createAnalogRequestHandler();

export default {
  async fetch(request: Request) {
    return (
      (await handleAnalogRequest(request)) ??
      new Response('Not Found', { status: 404 })
    );
  },
};
```

Analog handles:

- server functions (`/_analog/fn/:id`) and page endpoints (`/api/_analog/pages/**`);
- server-side rendering for `GET` requests outside `/api/`.

In development, Analog serves the entry's `fetch` behind Vite. In production, platforms and runtimes that invoke Fetchable modules, such as Netlify Functions, Deno and Bun, run the built entry without a server of your own.

### Fetch-native frameworks

Frameworks built on web `Request`/`Response`, such as Hono, are already Fetchable. Hand Analog the requests your routes don't handle, and export the app:

```ts
// src/server/main.ts
import { createAnalogRequestHandler } from '@analogjs/router/server';
import { Hono } from 'hono';

const app = new Hono();
const handleAnalogRequest = createAnalogRequestHandler({
  fetch: (request) => app.fetch(request),
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.all(
  '*',
  async (c) => (await handleAnalogRequest(c.req.raw)) ?? c.notFound(),
);

export default app;
```

Passing the app's `fetch` lets [server-side fetches](#server-side-fetches) reach your Hono routes in-process.

### Node frameworks

Frameworks built on Node's request and response, such as Express, NestJS and Fastify, wrap their app with `toFetchHandler()` from [srvx](https://srvx.h3.dev). In development, the app gets the dev server's Node request and response directly. In production, the entry can start its own server. Install `srvx`, then with Express:

```ts
// src/server/main.ts
import { createAnalogHandler } from '@analogjs/router/server';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { toFetchHandler } from 'srvx/node';

const app = express();
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Vite serves client files in development.
if (!import.meta.env.DEV) {
  const clientDir = fileURLToPath(new URL('../client', import.meta.url));
  app.use(express.static(clientDir, { index: false }));
}

app.use(createAnalogHandler());

if (!import.meta.env.DEV) {
  app.listen(process.env['PORT'] ?? 3000);
}

export default {
  fetch: toFetchHandler((req, res) => app(req, res)),
};
```

`(req, res) => app(req, res)` calls Express without a `next` callback, so a request nothing handles gets Express's `404` instead of an empty response.

When server code changes in development, Analog reloads the entry. Add a `close()` next to `fetch` to release what the previous entry holds, such as database connections; Analog calls it before using the new entry. See [NestJS](/docs/integrations/nestjs) for an entry that closes its app.

`createAnalogHandler()` is the Node adapter for `createAnalogRequestHandler()`: it handles Analog's requests and passes everything else to `next()`. Register your own routes before it. Routes under `/api/` that nothing handles reach your server's 404 handling instead of server-side rendering. It also passes the Node request and response to Analog as the `REQUEST` and `RESPONSE` tokens; with `createAnalogRequestHandler()`, pass them yourself as `handleAnalogRequest(request, { req, res })`.

## Server-side fetches

Requests that server-side rendering and page endpoints make to the app's own origin, such as `HttpClient` calls to `/api/...` and the `fetch` passed to page endpoints, run in-process instead of over the network, as with Nitro. Analog serves its own routes. To serve your server's routes too, pass a `fetch` that handles a `Request`, as the Hono example does. It gets the requests Analog doesn't handle, such as your own routes under `/api/` and non-`GET` requests outside `/api/`; other `GET` requests are server-rendered.

With a Node framework, forward these requests to the server's address:

```ts
// Your server's own address, never one taken from the request.
const origin = process.env['SERVER_ORIGIN'] ?? 'http://localhost:3000';

app.use(
  createAnalogHandler({
    fetch: (request) => {
      const { pathname, search } = new URL(request.url);
      return fetch(
        new Request(new URL(`${pathname}${search}`, origin), request),
      );
    },
  }),
);
```

In development, set `SERVER_ORIGIN` to Vite's dev server origin, such as `http://localhost:5173`. Without a `fetch`, these requests get a `404`. Prefer calling your services directly from page endpoints and server functions where you can.

## Static files

Vite serves client files in development. In production they're in `dist/client`, next to the `dist/server` directory that holds the server entry. A Fetchable entry leaves them to the platform, usually its CDN. A Node server serves them with its own tools (`express.static`, `serve-static`, NestJS's `useStaticAssets()`). Either way:

- Serve them **before** the Analog handler. Otherwise server-side rendering answers asset URLs.
- Disable the index fallback (`index: false`), so `/` is server-rendered instead of returning the client's `index.html`.

## Streaming

[Streaming SSR](/docs/features/server/streaming-ssr) works with a custom server: enable `experimental.streaming` and export `renderStream` from `main.server.ts`. Analog returns the document as a stream with `Cache-Control: no-store, no-transform`, and stops rendering when the client disconnects.

The status and headers go out with the first chunk, so anything the app sets through `RESPONSE` after rendering starts doesn't take effect. Use a buffered route when the status is decided during the render.

Route rules come from Nitro, so opt a route out of streaming with an `x-analog-no-streaming: true` header set before the Analog handler runs: on the response for Node servers, or on the request for fetch-native servers.

```ts
app.get('/report', (req, res, next) => {
  res.setHeader('x-analog-no-streaming', 'true');
  next();
});
```

## Internationalization

[i18n](/docs/features/i18n/overview) works with a custom server: configure `i18n` in `analog()` and `provideI18n()` as usual, and the locale is detected per request from the URL prefix or the `Accept-Language` header.

[Locale workers](/docs/features/i18n/overview#concurrent-server-rendering) come from Nitro, so every locale renders in one JavaScript context. Overlapping requests in different locales can produce mixed-language pages, as on Nitro without workers. Setting `i18n.workers: true` with a custom server fails the build.

Two details of locale detection apply here as on Nitro:

- `Accept-Language` tags must match a configured locale exactly: `fr-FR` doesn't match `fr`, and the default locale is used.
- In the browser, the locale comes from the URL. A page rendered in a locale detected from `Accept-Language` at an unprefixed URL switches to the default locale after hydration. Use [locale-prefixed URLs](/docs/features/i18n/overview#url-based-locale-routing) to keep the server and browser on the same locale.

## Building and running

`vite build` builds the client into `dist/client` and the server entry into `dist/server/main.js`. A Fetchable entry keeps its default export and doesn't listen on a port; deploy it to a platform or runtime that invokes Fetchable modules. Run a Node entry that starts its own server with Node:

```shell
node dist/server/main.js
```

The server bundle is an ES module, named `main.mjs` instead when your `package.json` doesn't set `"type": "module"`. In an Nx workspace, the output is under the project's directory, such as `dist/apps/my-app/client` and `dist/apps/my-app/server`.

## Limitations

- Prerendering, static site generation and deployment presets need Nitro.
- File-based API routes in `src/server/routes` aren't served; use your server's own routes.
- Locale workers and i18n prerendering need Nitro.
