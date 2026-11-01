# Custom Server

Serve an Analog app from your own server, such as NestJS, Express, Fastify or Hono, instead of Nitro. Your server owns the process and its routes, and Analog handles server-side rendering, page endpoints and server functions inside it.

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
  plugins: [
    analog({ ssr: true, server: { entry: 'src/server/main.ts' } }),
    angular(),
  ],
});
```

Vite compiles the TypeScript in the entry's directory. Frameworks that use decorators with dependency injection, like NestJS, also need `experimentalDecorators` and `emitDecoratorMetadata` in `tsconfig.json`. Vite 8 emits the decorator metadata; on Vite 6 and 7, esbuild can't, so compile the server directory with SWC (for example with `unplugin-swc`).

## The server entry

The entry exports `createApp()`, which the dev server mounts behind Vite, and starts its own server in production. With Express:

```ts
// src/server/main.ts
import { createAnalogHandler } from '@analogjs/router/server';
import express from 'express';
import { fileURLToPath } from 'node:url';

function createServer() {
  const app = express();
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Vite serves client files in development.
  if (!import.meta.env.DEV) {
    const clientDir = fileURLToPath(new URL('../client', import.meta.url));
    app.use(express.static(clientDir, { index: false }));
  }

  app.use(createAnalogHandler());
  return app;
}

export async function createApp() {
  return { handle: createServer() };
}

if (!import.meta.env.DEV) {
  createServer().listen(process.env['PORT'] ?? 3000);
}
```

`createApp()` returns `{ handle, close? }`, where `handle` is a Node `(req, res, next)` handler. When server code changes in development, Analog creates a new app and calls `close()` on the previous one.

`createAnalogHandler()` handles Analog's own requests and passes everything else to `next()`:

- server functions (`/_analog/fn/:id`) and page endpoints (`/api/_analog/pages/**`);
- server-side rendering for `GET` requests outside `/api/`.

Register your own routes before it. Routes under `/api/` that nothing handles reach your server's 404 handling instead of server-side rendering.

## Static files

Serving client files is the server's job, with its own tools (`express.static`, `serve-static`, NestJS's `useStaticAssets()`, a CDN). In production they're in `dist/client`, next to the `dist/server` directory that holds the server entry:

- Register them **before** the Analog handler. Otherwise server-side rendering answers asset URLs.
- Disable the index fallback (`index: false`), so `/` is server-rendered instead of returning the client's `index.html`.

## Fetch-native servers

Servers built on web `Request`/`Response`, such as Hono, use `createAnalogRequestHandler()`. It returns a function that takes a `Request` and returns a `Response`, or `null` for requests Analog doesn't handle:

```ts
import { createAnalogRequestHandler } from '@analogjs/router/server';
import { Hono } from 'hono';

const handleAnalogRequest = createAnalogRequestHandler();
const app = new Hono();

app.all(
  '*',
  async (c) => (await handleAnalogRequest(c.req.raw)) ?? c.notFound(),
);
```

Node servers that have the Node request and response can pass them as a second argument, `handleAnalogRequest(request, { req, res })`, so they become Analog's `REQUEST` and `RESPONSE` tokens. `createAnalogHandler()` does this for you.

## Building and running

`vite build` builds the client into `dist/client` and the server entry into `dist/server/main.js`. Run it with Node:

```shell
node dist/server/main.js
```

The server bundle is an ES module, named `main.mjs` instead when your `package.json` doesn't set `"type": "module"`. In an Nx workspace, the output is under the project's directory, such as `dist/apps/my-app/client` and `dist/apps/my-app/server`.

## Limitations

- Prerendering, static site generation and deployment presets need Nitro.
- File-based API routes in `src/server/routes` aren't served; use your server's own routes.
- Streaming server-side rendering and runtime i18n aren't supported yet.
