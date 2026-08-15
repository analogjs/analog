/// <reference path="./analog-modules.d.ts" />
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ApplicationConfig,
  Injector,
  StaticProvider,
  Type,
} from '@angular/core';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
  type NodeRequestHandlerFunction,
} from '@angular/ssr/node';
import {
  createApp,
  createEvent,
  createRouter,
  defineEventHandler,
  defineLazyEventHandler,
  toNodeListener,
  type EventHandler,
} from 'h3';
import { createRouter as createMatcher } from 'radix3';

import {
  createServerFnAppInjector,
  handleServerFnRequest,
  renderStream,
} from '@analogjs/router/server';
import type { ServerContext } from '@analogjs/router/tokens';

export type ApiRouteFiles = Record<string, () => Promise<{ default: unknown }>>;

/**
 * The `analog:page-endpoints` virtual module maps endpoint keys to lazy
 * imports in server bundles and to `true` in browser bundles, where the
 * keys only mark which routes fetch server load data.
 */
export type PageEndpointFiles = Record<
  string,
  true | (() => Promise<Record<string, unknown>>)
>;

export interface ApiRoute {
  /**
   * Route path in router syntax, e.g. `/api/products/:id`.
   */
  route: string;
  /**
   * Uppercase HTTP method from a `.get.ts`-style filename suffix, or
   * undefined when the handler serves all methods.
   */
  method?: string;
  filename: string;
}

const METHODS = new Set([
  'connect',
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
]);

/**
 * Maps discovered files under `src/server/routes` to route definitions
 * using the same filename conventions as the Nitro path: nested
 * directories become path segments, `[param]` becomes `:param`,
 * `[...slug]` becomes a catch-all, `index` maps to the directory path,
 * and a method suffix (e.g. `products.get.ts`) restricts the method.
 */
export function apiRoutesFromFiles(files: ApiRouteFiles): ApiRoute[] {
  return Object.keys(files).map((filename) => {
    const withoutExtension = filename
      .replace(/^.*?\/server\/routes/, '')
      .replace(/\.[^./]+$/, '');

    const segments = withoutExtension.split('/').filter(Boolean);
    let method: string | undefined = undefined;

    const lastSegment = segments[segments.length - 1] ?? '';
    const parts = lastSegment.split('.');
    if (parts.length > 1 && METHODS.has(parts[parts.length - 1])) {
      method = parts.pop()!.toUpperCase();
      segments[segments.length - 1] = parts.join('.');
    }

    if (segments[segments.length - 1] === 'index') {
      segments.pop();
    }

    const route =
      '/' +
      segments
        .map((segment) =>
          segment.replace(/\[\.{3}.*\]/, '**').replace(/\[([^\]]+)\]/g, ':$1'),
        )
        .join('/');

    return { route, method, filename };
  });
}

export interface ApiRoutesHandler {
  /**
   * True when a discovered route matches the pathname, so the caller
   * can fall through to the Angular handler otherwise.
   */
  matches(pathname: string): boolean;
  handler(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

/**
 * Builds a node-compatible handler serving h3 event handlers discovered
 * from `src/server/routes` (the `analog:api-routes` virtual module),
 * for server entries on the esbuild application builder. Handlers are
 * lazily imported on first hit.
 */
export function createApiRoutesHandler(files: ApiRouteFiles): ApiRoutesHandler {
  return toNodeHandler(
    apiRoutesFromFiles(files).map(({ route, method, filename }) => ({
      route,
      method,
      handler: defineLazyEventHandler(async () => {
        const module = await files[filename]();
        return module.default as never;
      }),
    })),
  );
}

/**
 * Maps `.server.ts` page endpoint files (keyed the way createRoutes
 * derives endpoint keys, e.g. `/src/app/pages/about.server.ts`) to the
 * `/{apiPrefix}/_analog/pages/...` routes that injectRouteEndpointURL
 * and the FormAction directive address.
 */
export function pageEndpointRoutesFromFiles(
  files: PageEndpointFiles,
  apiPrefix = 'api',
): ApiRoute[] {
  return Object.keys(files).map((filename) => {
    const endpoint = filename
      .replace(/\.server\.ts$/, '')
      .replace(/\[\[\.{3}.+\]\]/, '**')
      .replace(/\[\.{3}.+\]/, '**')
      .replace(/^(.*?)\/pages/, '/pages')
      .replace(/\./g, '/')
      .replace(/\[([^\]]+)\]/g, ':$1');

    return { route: `/${apiPrefix}/_analog${endpoint}`, filename };
  });
}

/**
 * Serves `.server.ts` page endpoints the way the Nitro path does: GET
 * runs the module's `load`, other methods run `action`, both receiving
 * `{ params, req, res, fetch, event }`. Mounted ahead of Angular in a
 * server entry alongside createApiRoutesHandler.
 */
export function createPageEndpointsHandler(
  files: PageEndpointFiles,
  apiPrefix = 'api',
): ApiRoutesHandler {
  return toNodeHandler(
    pageEndpointRoutesFromFiles(files, apiPrefix).map(
      ({ route, filename }) => ({
        route,
        handler: defineLazyEventHandler(async () => {
          const importEndpoint = files[filename];
          if (importEndpoint === true) {
            throw new Error(
              `Page endpoint ${filename} has no server import; ` +
                'createPageEndpointsHandler only runs in server bundles.',
            );
          }

          const module = (await importEndpoint()) as {
            load?: (context: unknown) => unknown;
            action?: (context: unknown) => unknown;
          };

          return defineEventHandler((event) => {
            const handler =
              event.method === 'GET' ? module.load : module.action;

            return (
              handler?.({
                params: event.context['params'] ?? {},
                req: event.node.req,
                res: event.node.res,
                fetch: globalThis.fetch,
                event,
              }) ?? {}
            );
          }) as never;
        }),
      }),
    ),
  );
}

/**
 * Serves the server-function dispatch route `/_analog/fn/:id` from a
 * server entry on the esbuild application builder. The registry is
 * populated by importing `analog:server-fns` for its side effects; the
 * dispatch parent injector is bootstrapped from the given config (or
 * providers) on first call, so handlers resolve the app's DI the same
 * way the Nitro dispatch endpoint does.
 */
export function createServerFnsHandler(
  configOrProviders?: ApplicationConfig | StaticProvider[],
): ApiRoutesHandler {
  let appInjector: Promise<Injector> | undefined;

  return toNodeHandler([
    {
      route: '/_analog/fn/:id',
      handler: defineEventHandler((event) => {
        appInjector ??= createServerFnAppInjector(configOrProviders);
        return handleServerFnRequest(event, appInjector);
      }),
    },
  ]);
}

// Context written by global middleware, carried per request so the
// separate h3 apps serving API routes and page endpoints see the same
// event.context a Nitro handler would.
const ANALOG_MIDDLEWARE_CONTEXT = Symbol('analog middleware context');

export interface ServerMiddlewareHandler {
  /**
   * Runs every middleware in filename order against the request.
   * Resolves true when one of them ended the response (e.g. a
   * redirect), so the caller stops; otherwise the middleware context is
   * stashed on the request for downstream handlers.
   */
  run(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
}

/**
 * Runs `src/server/middleware` handlers (the `analog:server-middleware`
 * map) globally, matching Nitro's convention: every request, filename
 * order, default h3 event handler exports. Return values are ignored —
 * middleware acts by ending the response or mutating `event.context`.
 */
export function createServerMiddlewareHandler(
  files: ApiRouteFiles,
): ServerMiddlewareHandler {
  let stack: Promise<EventHandler[]> | undefined;
  const load = () =>
    (stack ??= Promise.all(
      Object.keys(files)
        .sort()
        .map(async (file) => (await files[file]()).default as EventHandler),
    ));

  return {
    async run(req, res) {
      if (Object.keys(files).length === 0) {
        return false;
      }

      const event = createEvent(req, res);
      for (const handler of await load()) {
        await handler(event);
        if (res.writableEnded) {
          return true;
        }
      }

      (req as IncomingMessage & Record<symbol, unknown>)[
        ANALOG_MIDDLEWARE_CONTEXT
      ] = event.context;
      return false;
    },
  };
}

// Browsers enforce strict MIME checking for module scripts, so assets
// must be served with a real content type.
const MIME_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface AnalogRequestHandlerOptions {
  /**
   * Config the server-function dispatch injector bootstraps from —
   * typically the app's own server config, so handlers resolve the same
   * DI as an SSR render.
   */
  config?: ApplicationConfig | StaticProvider[];
  /**
   * The server entry's `import.meta.url`. When the entry is run
   * directly (`node server.mjs`), the handler listens on
   * `PORT` (default 4000); under the dev server it stays a middleware.
   */
  main?: string;
  /** Browser output directory; defaults to `../browser` beside the server bundle. */
  browserDistFolder?: string;
  /** Overrides the `analog:api-routes` map (loaded automatically). */
  apiRoutes?: ApiRouteFiles;
  /** Overrides the `analog:page-endpoints` map (loaded automatically). */
  pageEndpoints?: PageEndpointFiles;
  /** Overrides the `analog:server-fns` map (loaded automatically). */
  serverFns?: Record<string, Record<string, unknown>>;
  /** Overrides the `analog:server-middleware` map (loaded automatically). */
  serverMiddleware?: ApiRouteFiles;
  /**
   * EXPERIMENTAL: render the listed pathnames through `renderStream`,
   * flushing `@defer (hydrate …)` blocks as they resolve. Needs the
   * `analog.streaming` builder option (which patches the `@defer`
   * runtime in the server bundle), incremental hydration, and per
   * request rendering for those paths. Bots and `streaming: false`
   * routes fall back to a buffered render inside `renderStream`.
   */
  streaming?: {
    /** Root component to bootstrap for streamed renders. */
    component: Type<unknown>;
    /** Exact pathnames rendered through the streaming renderer. */
    paths: string[];
  };
}

/**
 * Loads the analog:* virtual modules. Literal dynamic imports are
 * resolved and bundled by the Analog esbuild plugins when the app's
 * server entry is built; anywhere else (plain node, tests) they fail
 * at runtime and everything resolves empty. Importing
 * `analog:server-fns` also registers each server function by id.
 */
async function loadAnalogModules(): Promise<{
  apiRoutes: ApiRouteFiles;
  pageEndpoints: PageEndpointFiles;
  serverFns: Record<string, Record<string, unknown>>;
  serverMiddleware: ApiRouteFiles;
}> {
  try {
    const [apiRoutes, pageEndpoints, serverFns, serverMiddleware] =
      await Promise.all([
        import('analog:api-routes'),
        import('analog:page-endpoints'),
        import('analog:server-fns'),
        import('analog:server-middleware'),
      ]);
    return {
      apiRoutes: apiRoutes.default,
      pageEndpoints: pageEndpoints.default,
      serverFns: serverFns.default,
      serverMiddleware: serverMiddleware.default,
    };
  } catch {
    return {
      apiRoutes: {},
      pageEndpoints: {},
      serverFns: {},
      serverMiddleware: {},
    };
  }
}

/**
 * The complete request handler for a server entry on the esbuild
 * application builder: server functions, page endpoints, and API routes
 * ahead of Angular, static browser assets with real MIME types, then
 * Angular SSR — falling through to `next()` under the dev server. The
 * analog:* maps are consumed internally; the entry only supplies its
 * url and the app's server config.
 *
 * ```ts
 * // server.ts
 * export const reqHandler = createAnalogRequestHandler({
 *   config,
 *   main: import.meta.url,
 * });
 * ```
 */
export function createAnalogRequestHandler(
  options: AnalogRequestHandlerOptions = {},
): NodeRequestHandlerFunction {
  const browserDistFolder =
    options.browserDistFolder ??
    (options.main
      ? fileURLToPath(new URL('../browser', options.main))
      : join(process.cwd(), 'browser'));

  const angularApp = new AngularNodeAppEngine();

  let handlersPromise:
    | Promise<{
        middleware: ServerMiddlewareHandler;
        apis: ApiRoutesHandler[];
      }>
    | undefined;
  const getHandlers = () =>
    (handlersPromise ??= (async () => {
      const loaded = await loadAnalogModules();
      const serverFns = options.serverFns ?? loaded.serverFns;
      return {
        middleware: createServerMiddlewareHandler(
          options.serverMiddleware ?? loaded.serverMiddleware,
        ),
        apis: [
          ...(Object.keys(serverFns).length
            ? [createServerFnsHandler(options.config)]
            : []),
          createPageEndpointsHandler(
            options.pageEndpoints ?? loaded.pageEndpoints,
          ),
          createApiRoutesHandler(options.apiRoutes ?? loaded.apiRoutes),
        ],
      };
    })());

  // Streaming renders bypass AngularNodeAppEngine (which buffers): the
  // shell document is the CSR index from the browser output, and the
  // render bootstraps the given component against the same config.
  let streamRender:
    | ((
        url: string,
        document: string,
        serverContext: ServerContext,
      ) => Promise<ReadableStream<Uint8Array>>)
    | undefined;
  let streamDocument: string | undefined;
  async function streamResponse(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const streaming = options.streaming!;
    const config = options.config;
    streamRender ??= renderStream(
      streaming.component,
      Array.isArray(config)
        ? { providers: config }
        : (config ?? { providers: [] }),
    );
    streamDocument ??= ['index.csr.html', 'index.html']
      .map((file) => join(browserDistFolder, file))
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file, 'utf8'))[0];
    if (streamDocument === undefined) {
      throw new Error(
        `[analog] streaming: no index document found in ${browserDistFolder}`,
      );
    }

    const stream = await streamRender(req.url ?? '/', streamDocument, {
      req,
      res,
    } as ServerContext);
    res.setHeader('content-type', 'text/html;charset=utf-8');
    for await (const chunk of stream) {
      res.write(chunk);
    }
    res.end();
  }

  async function handler(
    req: IncomingMessage,
    res: ServerResponse,
    next?: (err?: unknown) => void,
  ): Promise<void> {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const { middleware, apis } = await getHandlers();

    // Global middleware first, on every request — page renders and
    // static assets included, as under Nitro.
    if (await middleware.run(req, res)) {
      return;
    }

    for (const api of apis) {
      if (api.matches(pathname)) {
        await api.handler(req, res);
        return;
      }
    }

    if (options.streaming?.paths.includes(pathname)) {
      await streamResponse(req, res);
      return;
    }

    const asset = join(browserDistFolder, pathname);
    if (pathname !== '/' && existsSync(asset) && statSync(asset).isFile()) {
      res.writeHead(200, {
        'content-type':
          MIME_TYPES[extname(asset)] ?? 'application/octet-stream',
      });
      createReadStream(asset).pipe(res);
      return;
    }

    const response = await angularApp.handle(req);
    if (response) {
      await writeResponseToNodeResponse(response, res);
      return;
    }

    if (next) {
      next();
      return;
    }

    res.writeHead(404).end('Not found');
  }

  if (options.main && isMainModule(options.main)) {
    const port = Number(process.env['PORT'] ?? 4000);
    createServer((req, res) => handler(req, res)).listen(port, () =>
      console.log(`Listening on http://localhost:${port}`),
    );
  }

  return createNodeRequestHandler(handler);
}

function toNodeHandler(
  routes: { route: string; method?: string; handler: unknown }[],
): ApiRoutesHandler {
  const router = createRouter();
  const matcher = createMatcher();

  for (const { route, method, handler } of routes) {
    if (method) {
      router.add(route, handler as never, method.toLowerCase() as never);
    } else {
      router.use(route, handler as never);
    }
    matcher.insert(route, { route });
  }

  const app = createApp();
  // Merge context written by global middleware into this app's events,
  // so handlers read it the way they would under Nitro's shared app.
  app.use(
    defineEventHandler((event) => {
      const context = (
        event.node.req as IncomingMessage & Record<symbol, unknown>
      )[ANALOG_MIDDLEWARE_CONTEXT];
      if (context) {
        Object.assign(event.context, context);
      }
    }),
  );
  app.use(router);
  const listener = toNodeListener(app);

  return {
    matches: (pathname) => !!matcher.lookup(pathname),
    handler: async (req, res) => listener(req, res),
  };
}
