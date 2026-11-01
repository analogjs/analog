# Analog on NestJS (prototype)

A standalone Analog app (published `@analogjs/*@3.0.0-beta.18`, Angular 22, Vite 8) that uses **NestJS instead of Nitro** as its server. Node only, no SSG.

It answers one question: can Nest host an Analog app (SSR, page endpoints, server functions) without changing Analog itself? **Yes.** Every Analog runtime API used here is published and unmodified. The integration is about 300 lines in `src/analog-nest/`.

## Run it

```sh
npm install
npm run dev        # Vite hosts; Nest is mounted as middleware
npm run build      # client + one Nest server bundle
npm start          # node dist/server/main.js (PORT, default 3000)
npm run verify -- http://localhost:3000   # end-to-end checks (browser checks need playwright)
```

`verify.mjs` runs 13 checks. All pass against both `npm run dev` and `npm start`:

| Check                                                                   | Result |
| ----------------------------------------------------------------------- | ------ |
| SSR renders the page with `load` data and a server function result      | pass   |
| Nest controller GET / POST / 404                                        | pass   |
| Unknown `/api/*` route returns Nest's JSON 404, not SSR HTML            | pass   |
| Page endpoint `load`, which calls a Nest controller through its `fetch` | pass   |
| Page `defineAction`: urlencoded success, 422 on validation failure      | pass   |
| Server function: success, 400 on invalid input, 403 on cross-origin     | pass   |
| SSR, server functions and controllers share one Nest DI instance        | pass   |
| Browser: hydration, client server function call, form action, no errors | pass   |

## How it fits together

```
src/
  server/                 Nest app: main.ts entry, AppModule, controller, services
  app/                    Angular app
    pages/index.server.ts     page endpoint: load + defineAction
    server-fns/greeting.server.ts
                              serverFn calling a Nest service via injectNest()
  analog-nest/            what an @analogjs/nest package would contain
    analog.module.ts      AnalogModule: SSR catch-all + h3 sub-app for Analog endpoints
    nest-app.ts           NEST_APP token / injectNest(): Nest providers inside Angular DI
    vite-plugin.ts        analogNest(): build environments, dev middleware
```

- **Build.** `analogNest()` replaces `nitro()`: `analog()` + `angular()` + `analogNest()`. The client environment builds `index.html`. The SSR environment builds a single bundle from `src/server/main.ts`, containing Nest, the Angular SSR renderer and all `*.server.ts` modules. Nest stays external and loads from `node_modules`.
- **Runtime.** `AnalogModule.onModuleInit` runs after Nest registers every controller route and before Nest adds its 404 handler. That makes it the natural place to append, in order:
  1. static client assets (production only)
  2. an h3 sub-app for `/_analog/fn/:id` and `/api/_analog/pages/**`
  3. the SSR catch-all for non-`/api` GETs

  Controllers always win. Analog only sees requests no controller claimed.

- **Analog endpoints reuse Analog's own handlers.**
  - Server functions: `createServerFnEventHandler(createServerFnAppInjector(config))`, exactly what Nitro registers.
  - Page endpoints: a small h3 wrapper (`pageEndpointHandler`) calls each `load`/`action`.
  - h3 v1 is used as a router mounted with `toNodeListener`. It runs inside Express on the same Node `req`/`res`.
- **Dependency injection bridge.** `AnalogModule` stores Nest's `ModuleRef`. `injectNest(GreetingService)` resolves it inside any Angular injection context. Over HTTP and during in-process SSR calls, a server function gets the same singleton the controllers use.
- **Dev.** Vite hosts the dev server. The plugin removes Vite's HTML fallbacks and hands remaining requests to the Nest Express app, loaded through `ssrLoadModule`. When the server module graph changes, `ssrLoadModule` returns a new module; the plugin then closes the old Nest app and starts a new one. Restarts measured 6–9 ms.

## Findings

1. **Nitro is already opt-in in v3.** The platform only enables its Nitro integration when `nitro()` is in the Vite plugins. Leaving it out is the `server: false` switch, so no platform option is needed.
2. **SWC is not needed on Vite 8.** Oxc lowers legacy decorators and emits `design:paramtypes` when the tsconfig sets `experimentalDecorators` and `emitDecoratorMetadata`. Nest services pulled into the Angular program (for example through a `.server.ts` import) get the same metadata from Angular's TypeScript emit. Implicit constructor injection works through both paths. Vite 6/7 use esbuild, which cannot emit decorator metadata, so they would still need SWC. Not tested here.
3. **Analog disables Vite's TypeScript transform globally.**
   - The Angular plugin sets `oxc: false`, and the platform's `depsPlugin` adds `oxc.exclude: ['**/*.ts', '**/*.js']`.
   - Nitro never notices because it bundles `src/server` itself. A Vite-hosted server does notice: in dev, Nest files reach Vite's SSR transform as raw TypeScript and fail to parse.
   - `analogNest()` has to _assign_ `config.oxc` with an include for the server directories. A returned config can't remove array entries, because `mergeConfig` concatenates arrays.
   - A supported way to declare non-Angular server directories would remove this hack.
4. **`consumer: 'server'` must be set explicitly on the SSR environment.**
   - The Angular build optimizer defines `ngServerMode: true` only when `config.consumer === 'server'` in `configEnvironment`. Vite hasn't applied the default consumer at that point.
   - Without the explicit setting, the production SSR bundle constant-folds the browser branch and crashes on `window` (event replay).
   - Nitro sets it explicitly. This is a latent bug in `@analogjs/vite-plugin-angular` that any custom server environment hits.
5. **Body parsing.**
   - Nest's JSON and urlencoded parsers run before Analog's handlers. `NestFactory.create(AppModule, { rawBody: true })` keeps the original bytes, and h3 reads `req.rawBody` first. Urlencoded and multipart actions both work.
   - The one difference from Nitro: malformed JSON sent to a server function gets Nest's 400 body instead of Analog's `Malformed request body` contract. Excluding the Analog prefixes from Nest's parsers would fix it.
6. **Page endpoints needed a small re-implementation.**
   - The h3 wrapper (`pageEndpointsPlugin`) lives in `@analogjs/vite-plugin-nitro`.
   - The file-to-route mapping duplicates `getPageHandlers`, which returns Nitro handler types.
   - A package would want both exported from Analog without Nitro types.
7. **`INTERNAL_FETCH`.**
   - The SSR render receives an ofetch instance, as Nitro passes one, so the router's HTTP interceptor can use `.raw()`. It goes over loopback HTTP; Express has no in-process `inject` like Fastify's.
   - Server function results reach the client through TransferState with no refetch.
   - The page `load` is fetched again after hydration. That looks like existing Analog behaviour: `route-config.ts` calls `INTERNAL_FETCH` directly and skips TransferState. This comes from reading the code and was not reproduced on Nitro.
8. **One module instance, no globals.** Dev uses one Vite module graph and production builds one server bundle, so a module-level `ModuleRef` is shared by the Nest app, SSR and server functions. Nothing goes on `globalThis` except the dev-only Vite server handle.
9. **Client bundle.** `*.server.ts` files that import Nest classes are scrubbed to proxies by the platform as usual. No Nest code reaches `dist/client`.

## Not covered

Fastify adapter, Vite 6/7, streaming SSR, i18n, prerendering, `src/server/routes` (Nest controllers replace file-based API routes on purpose), WebSockets, Windows paths.

## Toward an `@analogjs/nest` package

- Replace the `import.meta.glob` calls in `analog.module.ts` with a virtual module generated by the Vite plugin. Globs don't run inside an externalized `node_modules` package.
- Export the page-endpoint route mapping and handler wrapper from Analog without Nitro types.
- Default `consumer: 'server'` handling in the Angular build optimizer (finding 4).
- A supported option for non-Angular server directories that keeps Oxc enabled (finding 3).
- Optionally keep Nest's body parsers off the Analog prefixes (finding 5).
