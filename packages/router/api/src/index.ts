import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ApplicationConfig,
  Injector,
  StaticProvider,
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
  createRouter,
  defineEventHandler,
  defineLazyEventHandler,
  toNodeListener,
} from 'h3';
import { createRouter as createMatcher } from 'radix3';

import {
  createServerFnAppInjector,
  handleServerFnRequest,
} from '@analogjs/router/server';

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
  /** The `analog:api-routes` map, served ahead of Angular. */
  apiRoutes?: ApiRouteFiles;
  /** The `analog:page-endpoints` map, served at `/api/_analog/pages/...`. */
  pageEndpoints?: PageEndpointFiles;
  /**
   * Config the server-function dispatch injector bootstraps from —
   * typically the app's own server config, so handlers resolve the same
   * DI as an SSR render. The `/_analog/fn/:id` route is always mounted;
   * without server functions it answers 404.
   */
  serverFns?: ApplicationConfig | StaticProvider[];
  /**
   * The server entry's `import.meta.url`. When the entry is run
   * directly (`node server.mjs`), the handler listens on
   * `PORT` (default 4000); under the dev server it stays a middleware.
   */
  main?: string;
  /** Browser output directory; defaults to `../browser` beside the server bundle. */
  browserDistFolder?: string;
}

/**
 * The complete request handler for a server entry on the esbuild
 * application builder: server functions, page endpoints, and API routes
 * ahead of Angular, static browser assets with real MIME types, then
 * Angular SSR — falling through to `next()` under the dev server.
 *
 * ```ts
 * // server.ts
 * export const reqHandler = createAnalogRequestHandler({
 *   apiRoutes,
 *   pageEndpoints,
 *   serverFns: config,
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
  const handlers = [
    createServerFnsHandler(options.serverFns),
    createPageEndpointsHandler(options.pageEndpoints ?? {}),
    createApiRoutesHandler(options.apiRoutes ?? {}),
  ];

  async function handler(
    req: IncomingMessage,
    res: ServerResponse,
    next?: (err?: unknown) => void,
  ): Promise<void> {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

    for (const api of handlers) {
      if (api.matches(pathname)) {
        await api.handler(req, res);
        return;
      }
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
  app.use(router);
  const listener = toNodeListener(app);

  return {
    matches: (pathname) => !!matcher.lookup(pathname),
    handler: async (req, res) => listener(req, res),
  };
}
