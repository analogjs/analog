# Analog on a Node server (prototype)

A standalone Analog app (published `@analogjs/*@3.0.0-beta.18`, Angular 22, Vite 8) served by **its own Node server instead of Nitro**: Node only, no SSG.

It has two parts:

- `src/analog-node/` is a **server-agnostic layer** that could move into Analog. It contains a Node request handler and a Vite plugin, and doesn't reference Nest.
- **NestJS is one host for that layer.** The Nest-specific code is a short recipe. The same app also runs on plain `node:http` (`src/node-server/main.ts`).

Analog itself is unchanged: every Analog runtime API used here is published as-is.

## Run it

```sh
npm install
npm run dev          # Nest host; Vite serves, Nest is mounted as middleware
npm run dev:node     # the same app on plain node:http
npm run build        # client + one server bundle (Nest host)
npm start            # node dist/server/main.js (PORT, default 3000)
npm run verify -- http://localhost:3000                 # Nest host
npm run verify -- http://localhost:3000 --analog-only   # any host
```

`verify.mjs` runs HTTP checks plus a Playwright browser check (skipped when Playwright isn't installed). Every combination passes:

| Host        | dev                 | production          |
| ----------- | ------------------- | ------------------- |
| NestJS      | 16 / 16             | 16 / 16             |
| `node:http` | 7 / 7 (Analog-only) | 7 / 7 (Analog-only) |

The checks cover:

- SSR, page endpoint `load`s (one of them calls a Nest controller through `fetch`) and `defineAction` (200 and 422)
- Server functions: success, 400 on invalid input, 403 cross-origin, 404 for an unknown ID
- Nest controllers (GET, POST, 404); an unclaimed `/api` route goes to the host, not SSR
- One Nest DI instance shared by SSR, server functions and controllers
- Hydration, a client-side server function call and a form submit in a real browser, with no console errors

## Layout

```
src/
  analog-node/        server-agnostic layer (no Nest imports)
    handler.ts        createAnalogHandler(): (req, res, next) Node handler
    vite-plugin.ts    analogNodeServer(): build environments, generated module, dev server
    server.d.ts       types for virtual:analog-node/server
  server/             NestJS host (app code)
    main.ts           createApp() for dev; listens in production
    app.module.ts     the recipe: mount the handler in onModuleInit
    inject-nest.ts    injectNest(): Nest providers inside Angular DI
    ...               controller and services
  node-server/
    main.ts           the same handler on node:http
  app/                Angular app (pages, server functions)
```

## The generic layer

### `createAnalogHandler()`

Returns a `(req, res, next)` handler that serves the whole Analog app on any Node server:

1. Static client files (production only, via `serve-static`, with `index: false` so `/` is rendered).
2. `/_analog/fn/:id` and `/<apiPrefix>/_analog/pages/**`, through an h3 v1 sub-app built from Analog's own handlers:
   - Server functions use `createServerFnEventHandler(createServerFnAppInjector(config))`, exactly what Nitro registers.
   - Page endpoints call each `load` or `action` with an ofetch `fetch`, matching what Nitro provides.
3. SSR for any GET outside `/<apiPrefix>/`, using the app's `main.server.ts` renderer. It receives an ofetch instance as `ServerContext.fetch`, which the router uses for TransferState.
4. Everything else goes to `next()`, so the host's own routes and 404 handling apply.

### `analogNodeServer({ entry, serverDirs })`

A Vite plugin used in place of `nitro()`:

- **Build:** a `client` environment (`index.html` → `dist/client`) and a server environment (`entry` → `dist/server`, with chunks flat so every chunk finds `../client`), built in that order.
- **Generated module:** `virtual:analog-node/server` exports the SSR renderer, the app's server config, imports of every `*.server.ts` (so server functions register), and lazy page endpoints keyed by route. It uses `apiPrefix` and `sourceRoot` from `analog()`'s options. In dev it is invalidated when a `*.server.ts` file is added or removed, so new page endpoints work without a restart.
- **Dev:** removes Vite's HTML fallbacks, loads `entry` with `ssrLoadModule`, calls its `createApp()` and hands every request Vite doesn't serve to `app.handle`. When the server module graph changes, it starts a new app and closes the old one (`app.close`), which took 7–10 ms in testing.
- **Compiling server code:** turns Vite's Oxc transform back on for `serverDirs` (finding 3 below).

The entry contract is one export: `createApp(): Promise<{ handle, close? }>`. In production the entry listens on its own.

## The NestJS recipe

```ts
@Module({ controllers: [HelloController], providers: [GreetingService] })
export class AppModule implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    moduleRef: ModuleRef,
  ) {
    setNestApp(moduleRef); // for injectNest()
  }

  // After Nest registers controller routes, before its 404 handler.
  onModuleInit(): void {
    this.adapterHost.httpAdapter.use(createAnalogHandler());
  }
}
```

The entry creates the app with `NestFactory.create(AppModule, { rawBody: true })`. For dev, `createApp()` returns `{ handle: app.getHttpAdapter().getInstance(), close: () => app.close() }`. `injectNest(GreetingService)` (`inject-nest.ts`, about 25 lines) resolves Nest providers from server functions, page loads and SSR.

Nest-specific code in total: the `onModuleInit` mount, `rawBody: true`, `createApp()`, and `inject-nest.ts`.

## Findings

1. **Nitro is already opt-in in v3.** The platform only enables its Nitro integration when `nitro()` is in the Vite plugins, so leaving it out needs no new option.
2. **SWC is not needed on Vite 8.** Oxc lowers legacy decorators and emits `design:paramtypes` when the tsconfig sets `experimentalDecorators` and `emitDecoratorMetadata`. Nest services pulled into the Angular program (for example through a `.server.ts` import) get the same metadata from Angular's TypeScript emit. Vite 6/7 use esbuild, which cannot emit decorator metadata; that wasn't tested here.
3. **Analog disables Vite's TypeScript transform globally.**
   - The Angular plugin sets `oxc: false`, and the platform's `depsPlugin` adds `oxc.exclude: ['**/*.ts', '**/*.js']`.
   - Nitro bundles `src/server` itself, so it never notices. A Vite-hosted server does: its files reach Vite's SSR transform as raw TypeScript.
   - The plugin has to _assign_ `config.oxc`, because `mergeConfig` concatenates arrays and the excludes would survive a returned config.
4. **`consumer: 'server'` must be explicit.** The Angular build optimizer defines `ngServerMode: true` only when `config.consumer === 'server'` in `configEnvironment`, and Vite hasn't applied the default yet at that point. Without it, the production SSR bundle constant-folds the browser branch and crashes on `window` (event replay). Nitro sets it explicitly, so this is a latent bug that any custom server environment hits.
5. **Body parsing (Nest).** Nest's parsers run before Analog's handlers. `rawBody: true` keeps the original bytes, and h3 reads `req.rawBody` first, so urlencoded and multipart actions work. The one difference from Nitro: malformed JSON sent to a server function gets Nest's 400 body instead of Analog's `Malformed request body` contract.
6. **Page endpoints needed a small re-implementation.** Nitro's h3 wrapper (`pageEndpointsPlugin`) lives in `@analogjs/vite-plugin-nitro`, and the route mapping duplicates `getPageHandlers`, which returns Nitro types.
7. **`load` data is fetched again after hydration.** Server function results reach the client through TransferState, but the page `load` doesn't. `route-config.ts` calls `INTERNAL_FETCH` directly and skips TransferState, so this looks like existing Analog behaviour; it was found by reading the code, not reproduced on Nitro.
8. **One module instance.** Dev uses one Vite module graph and production builds one server bundle, so a module-level `ModuleRef` is shared by the host, SSR and server functions.
9. **Client bundle.** `*.server.ts` files that import Nest classes are scrubbed to proxies by the platform as usual. No server code reaches `dist/client`.

## Not covered

Fastify (needs `@fastify/middie` for `use()`), Vite 6/7, streaming SSR, i18n, prerendering, per-route `ssr: false`, `src/server/routes` (the host's own routes replace file-based API routes), WebSockets, Windows paths, Nx layouts where the workspace root differs from the app root.

## Proposal

- **Fix in Analog regardless:** findings 3, 4 and 6, plus checking finding 7 on Nitro.
- **Add to Analog:** `createAnalogHandler()` and a Vite plugin such as `analogNodeServer()` (or an `analog()` option), shaped like `src/analog-node/`. Any Node host can use them: Nest, Express, Fastify, or a custom `server.mjs`.
- **NestJS:** a docs recipe (the module above plus `injectNest()`), not a dedicated package.
