# NestJS Integration with Analog

[NestJS](https://nestjs.com) can serve your Analog app as a [custom server](/docs/features/server/custom-server). NestJS owns the process and its controllers, and Analog handles server-side rendering, page endpoints and server functions inside it. Server functions, page `load`s and server-side rendering can use your NestJS services directly.

:::info

A custom server runs on Node.js. Prerendering, static site generation and deployment presets come from Nitro, so they aren't available with NestJS as the server.

:::

## Creating a new project

`create-analog` can scaffold a new project with this setup:

```shell
npm create analog@latest my-app -- --template latest --server nestjs
```

To add NestJS to an existing project, follow the steps below.

## Step 1: Install NestJS

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata h3
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata h3
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm add @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata h3
```

  </TabItem>
</Tabs>

NestJS's dependency injection reads decorator metadata, so enable it in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

Vite 8 emits the metadata out of the box. On Vite 6 and 7, compile the server directory with SWC, for example through `unplugin-swc`, since esbuild can't emit decorator metadata.

## Step 2: Configure Vite

Point the `server` option at the NestJS entry, and leave `nitro()` out of the plugins:

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [analog({ server: { entry: 'src/server/main.ts' } }), angular()],
});
```

## Step 3: Mount Analog in your module

Add Analog's handler in `onModuleInit`. NestJS calls it after registering every controller route and before installing its 404 handler, so your controllers take precedence and Analog only sees the requests they don't claim:

```ts
// src/server/app.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createAnalogHandler } from '@analogjs/router/server';

import { GreetingService } from './greeting.service';
import { HelloController } from './hello.controller';

@Module({
  controllers: [HelloController],
  providers: [GreetingService],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    this.adapterHost.httpAdapter.use(createAnalogHandler());
  }
}
```

Server-side rendering and page endpoints fetch Analog's own routes in-process. To reach your controllers from a page `load` or an `HttpClient` call during server-side rendering, pass a `fetch` to `createAnalogHandler()`, as described in [server-side fetches](/docs/features/server/custom-server#server-side-fetches), or use your NestJS services directly, as shown [below](#using-nestjs-services-from-angular-code).

## Step 4: Create the server entry

The entry exports `createApp()`, which the dev server mounts behind Vite, and listens in production:

```ts
// src/server/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { fileURLToPath } from 'node:url';

import { AppModule } from './app.module';

async function createNestApp() {
  // Keeps the request body for Analog after Nest's body parsers have run.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Vite serves client files in development.
  if (!import.meta.env.DEV) {
    const clientDir = fileURLToPath(new URL('../client', import.meta.url));
    app.useStaticAssets(clientDir, { index: false });
  }

  return app.init();
}

export async function createApp() {
  const app = await createNestApp();
  return {
    handle: app.getHttpAdapter().getInstance(),
    close: () => app.close(),
  };
}

if (!import.meta.env.DEV) {
  const app = await createNestApp();
  await app.listen(process.env['PORT'] ?? 3000);
}
```

A few details matter here:

- `rawBody: true` keeps the original request bytes, so form actions and server functions can read bodies that NestJS's parsers already consumed.
- Static files are registered before `app.init()`. Anything registered after it sits behind NestJS's 404 handler, and `init()` is also where the Analog handler is mounted.
- `index: false` keeps `/` server-rendered instead of returning the client's `index.html`.
- In development, Analog creates a new NestJS app when server code changes, and calls `close()` on the previous one.

## Using the Fastify adapter

With `@nestjs/platform-fastify`, NestJS runs Analog's handler through `@fastify/middie`, which the adapter registers itself. Install the adapter and `serve-static`:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @nestjs/platform-fastify serve-static
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @nestjs/platform-fastify serve-static
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm add @nestjs/platform-fastify serve-static
```

  </TabItem>
</Tabs>

The module from [Step 3](#step-3-mount-analog-in-your-module) stays the same. The entry creates a Fastify app and hands Vite Fastify's request handler:

```ts
// src/server/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { fileURLToPath } from 'node:url';
import serveStatic from 'serve-static';

import { AppModule } from './app.module';

async function createNestApp() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Vite serves client files in development.
  if (!import.meta.env.DEV) {
    const clientDir = fileURLToPath(new URL('../client', import.meta.url));
    app.use(serveStatic(clientDir, { index: false }));
  }

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export async function createApp() {
  const app = await createNestApp();
  const fastify = app.getHttpAdapter().getInstance();
  return {
    handle: (req, res) => fastify.routing(req, res),
    close: () => app.close(),
  };
}

if (!import.meta.env.DEV) {
  const app = await createNestApp();
  await app.listen(process.env['PORT'] ?? 3000, '0.0.0.0');
}
```

How it differs from Express:

- Middleware runs before Fastify's routes, so Analog sees requests before your controllers. Your controllers still answer their routes under `/api/` and their non-`GET` routes, because Analog passes those on, but a `GET` controller route outside `/api/` would be server-rendered. Keep controllers under `/api/`, for example with `app.setGlobalPrefix('api')`.
- Analog reads request bodies before Fastify parses them, so `rawBody` isn't needed, and malformed JSON sent to a server function gets Analog's `400`.
- Static files go through `serve-static` as middleware, registered before `init()`. `useStaticAssets()` registers a Fastify route, which Analog's handler would run ahead of.
- `listen()` binds to `localhost` unless given a host; `'0.0.0.0'` accepts outside connections, for example in a container.

## Development

Under `vite`, NestJS runs inside the dev server rather than listening on its own port:

- The first request Vite doesn't serve itself calls `createApp()`, which runs `NestFactory.create()` and `init()`.
- Vite serves client files and HMR, and passes every other request to NestJS, which routes it as in production.
- Vite compiles the NestJS code, so there's no `nest start --watch` or `tsc` step.
- When server code changes, the next request creates a new NestJS app and calls `close()` on the previous one, so shutdown hooks run.
- To reach controllers from [server-side fetches](/docs/features/server/custom-server#server-side-fetches), point the origin at Vite's dev server, such as `http://localhost:5173`.

## Using NestJS services from Angular code

Server functions, page `load`s and server-side rendering run inside the NestJS process, so they can use the same service instances as your controllers. Expose NestJS's `ModuleRef` through an Angular injection token:

```ts
// src/server/inject-nest.ts
import { InjectionToken, inject } from '@angular/core';
import type { Type } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';

let moduleRef: ModuleRef | undefined;

export function setNestApp(ref: ModuleRef): void {
  moduleRef = ref;
}

export const NEST_APP = new InjectionToken<ModuleRef>('NEST_APP', {
  providedIn: 'root',
  factory: () => {
    if (!moduleRef) {
      throw new Error('The NestJS application is not initialized.');
    }
    return moduleRef;
  },
});

export function injectNest<T>(token: Type<T> | string | symbol): T {
  return inject(NEST_APP).get(token, { strict: false });
}
```

Set it from your module:

```ts
// src/server/app.module.ts
import { HttpAdapterHost, ModuleRef } from '@nestjs/core';
import { setNestApp } from './inject-nest';

export class AppModule implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    moduleRef: ModuleRef,
  ) {
    setNestApp(moduleRef);
  }
  // ...
}
```

Then resolve NestJS providers in a server function:

```ts
// src/app/greeting.server.ts
import { serverFn } from '@analogjs/router/server';
import * as v from 'valibot';

import { injectNest } from '../server/inject-nest';
import { GreetingService } from '../server/greeting.service';

export const greet = serverFn(
  v.object({ name: v.string() }),
  async ({ name }) => injectNest(GreetingService).greet(name),
);
```

`.server.ts` files are server-only, so the client bundle gets a small proxy and none of the NestJS code.

## Building and running

```shell
npm run build
node dist/server/main.js
```

## Limitations

- With the Express adapter, malformed JSON sent to a server function gets NestJS's `400` response rather than Analog's, because NestJS's JSON parser runs first.
- WebSockets go through NestJS gateways.
