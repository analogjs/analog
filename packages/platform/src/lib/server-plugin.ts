import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { NodeHttp1Handler } from 'srvx';
import { toNodeHandler } from 'srvx/node';
import {
  normalizePath,
  type Connect,
  type Plugin,
  type ViteDevServer,
} from 'vite';

import { getPageEndpoints } from './get-page-endpoints.js';
import { getServerFnHandlers } from './nitro/get-server-fn-handlers.js';
import type { Options, ServerOptions } from './options.js';

const MANIFEST_PLACEHOLDER = /ANALOG_SERVER_MANIFEST = \{\}/;
const DEV_TEMPLATE = Symbol.for('@analogjs/platform/dev-template');
const HTML_MIDDLEWARES = [
  'viteIndexHtmlMiddleware',
  'vite404Middleware',
  'viteSpaFallbackMiddleware',
  'viteHtmlFallbackMiddleware',
];
const NITRO_PLUGINS = ['nitro:main', '@analogjs/vite-plugin-nitro'];

type ServerEntry = {
  default?: {
    fetch?: (request: Request) => Response | Promise<Response>;
    close?: () => unknown;
  };
};

/**
 * Builds and serves the app from `server.entry` instead of Nitro: the client
 * and one server bundle in `vite build`, and the entry's app behind Vite's
 * own middleware in dev. Fills in the `ANALOG_SERVER_MANIFEST` placeholder
 * that `createAnalogRequestHandler()` in `@analogjs/router/server` reads.
 */
export function serverPlugin(
  server: ServerOptions,
  options: Options = {},
): Plugin {
  const workspaceRoot =
    options.workspaceRoot ?? process.env['NX_WORKSPACE_ROOT'] ?? process.cwd();
  const apiPrefix = options.apiPrefix ?? 'api';
  let root = process.cwd();
  let isBuild = false;
  let builtTemplate: string | undefined;
  let manifestId: string | undefined;

  const rootDir = () => relative(workspaceRoot, root) || '.';
  const indexHtml = () => resolve(root, options.index ?? 'index.html');

  return {
    name: '@analogjs/platform-server',
    config(config, { command }) {
      const plugins = ((config.plugins ?? []) as unknown[]).flat(Infinity) as (
        | { name?: string }
        | null
        | undefined
      )[];
      if (plugins.some((p) => NITRO_PLUGINS.includes(p?.name ?? ''))) {
        throw new Error(
          '[@analogjs/platform] `analog({ server })` replaces Nitro; remove `nitro()` from the Vite plugins.',
        );
      }
      if (options.i18n?.workers === true) {
        throw new Error(
          '[@analogjs/platform] `i18n.workers` needs Nitro; remove it to use `analog({ server })`, which renders without locale workers.',
        );
      }
      root = normalizePath(resolve(config.root ?? process.cwd()));
      isBuild = command === 'build';
      const outDir = (name: string) =>
        resolve(workspaceRoot, 'dist', rootDir(), name);
      return {
        // Build-time values the router reads, as `nitro()` defines them.
        define: {
          ANALOG_API_PREFIX: JSON.stringify(apiPrefix),
          ...(options.i18n && {
            ANALOG_I18N_DEFAULT_LOCALE: JSON.stringify(
              options.i18n.defaultLocale,
            ),
            ANALOG_I18N_LOCALES: JSON.stringify(options.i18n.locales),
          }),
        },
        environments: {
          client: {
            build: {
              outDir: outDir('client'),
              rollupOptions: { input: indexHtml() },
            },
          },
          ssr: {
            build: {
              outDir: outDir('server'),
              copyPublicDir: false,
              rollupOptions: { input: { main: resolve(root, server.entry) } },
            },
          },
        },
        builder: {
          // One plugin instance for both builds, so the server build sees
          // the document captured from the client build.
          sharedPlugins: true,
          async buildApp(builder) {
            await builder.build(builder.environments['client']);
            await builder.build(builder.environments['ssr']);
          },
        },
      };
    },
    // The server bundle renders around the built document, so take it from
    // the client build's own output.
    writeBundle(_options, bundle) {
      if (this.environment.name === 'client') {
        const document = bundle[normalizePath(relative(root, indexHtml()))];
        if (document?.type === 'asset') {
          builtTemplate = String(document.source);
        }
      }
    },
    transform: {
      filter: { code: 'ANALOG_SERVER_MANIFEST' },
      handler(code, id) {
        if (!MANIFEST_PLACEHOLDER.test(code)) {
          return undefined;
        }
        manifestId = id;
        return code.replace(
          MANIFEST_PLACEHOLDER,
          `ANALOG_SERVER_MANIFEST = ${serverManifest()}`,
        );
      },
    },
    configureServer(viteServer) {
      (globalThis as Record<symbol, unknown>)[DEV_TEMPLATE] = (url: string) =>
        viteServer.transformIndexHtml(url, readFileSync(indexHtml(), 'utf-8'));

      // New or removed page endpoints and server functions change the manifest.
      const invalidateManifest = (file: string) => {
        const graph = viteServer.environments['ssr'].moduleGraph;
        const mod = manifestId && graph.getModuleById(manifestId);
        if (file.endsWith('.server.ts') && mod) {
          graph.invalidateModule(mod);
        }
      };
      viteServer.watcher.on('add', invalidateManifest);
      viteServer.watcher.on('unlink', invalidateManifest);

      return () => {
        removeHtmlMiddlewares(viteServer.middlewares);
        viteServer.middlewares.use(
          devMiddleware(viteServer, resolve(root, server.entry)),
        );
      };
    },
  };

  function requireBuiltTemplate(): string {
    if (builtTemplate === undefined) {
      throw new Error(
        `[@analogjs/platform] The client build didn't emit ${relative(root, indexHtml())}, which the server renders around.`,
      );
    }
    return builtTemplate;
  }

  /**
   * The manifest object literal: the template, and lazy imports of the SSR
   * renderer, the server config, every server function module, and page
   * endpoints keyed by route.
   */
  function serverManifest(): string {
    const src = `${root}/src`;
    const lazy = (file: string) => `() => import(${JSON.stringify(file)})`;
    const appConfig = [
      `${src}/app/app.config.server.ts`,
      `${src}/app.config.server.ts`,
    ].find((file) => existsSync(file));
    const discovery = {
      workspaceRoot,
      sourceRoot: 'src',
      rootDir: rootDir(),
    };
    const pageEndpoints = getPageEndpoints({
      ...discovery,
      additionalPagesDirs: options.additionalPagesDirs,
    }).map(
      ({ file, route }) =>
        `${JSON.stringify(`/${apiPrefix}/_analog${route}`)}: ${lazy(normalizePath(file))}`,
    );
    const serverFnModules = getServerFnHandlers(discovery).map(({ file }) =>
      lazy(file),
    );
    const template = isBuild
      ? `async () => ${JSON.stringify(requireBuiltTemplate())}`
      : `(url) => globalThis[Symbol.for('@analogjs/platform/dev-template')](url)`;

    return `{
  apiPrefix: ${JSON.stringify(apiPrefix)},
  template: ${template},
  render: () => import(${JSON.stringify(normalizePath(resolve(root, options.entryServer ?? 'src/main.server.ts')))}).then((m) => m.default),
  config: ${
    appConfig
      ? `() => import(${JSON.stringify(appConfig)}).then((m) => m.config)`
      : `async () => ({ providers: [] })`
  },
  serverFnModules: [${serverFnModules.join(', ')}],
  pageEndpoints: {${pageEndpoints.join(', ')}},
}`;
  }
}

/**
 * Hands every request Vite doesn't serve to the entry's `fetch`. The handler is
 * recreated when the server module graph changes (ssrLoadModule returns a new
 * module), and the previous entry's `close()` is called.
 */
function devMiddleware(
  viteServer: ViteDevServer,
  entry: string,
): Connect.NextHandleFunction {
  let current: { entry: ServerEntry; handle: NodeHttp1Handler } | undefined;

  async function getHandler(): Promise<NodeHttp1Handler> {
    const loaded = (await viteServer.ssrLoadModule(entry)) as ServerEntry;
    if (current?.entry !== loaded) {
      const previous = current?.entry.default;
      current = { entry: loaded, handle: toHandler(loaded) };
      void Promise.resolve()
        .then(() => previous?.close?.())
        .catch(() => undefined);
    }
    return current.handle;
  }

  return (req, res, next) => {
    getHandler()
      .then((handle) => handle(req, res))
      .catch((error: Error) => {
        viteServer.ssrFixStacktrace(error);
        next(error);
      });
  };
}

/** A Node handler around the `fetch` of a Fetchable entry (https://fetchable.org). */
function toHandler(entry: ServerEntry): NodeHttp1Handler {
  const fetchable = entry.default;
  const handleRequest = fetchable?.fetch;
  if (typeof handleRequest !== 'function') {
    throw new Error(
      '[@analogjs/platform] The server entry must be a Fetchable module: a default export with `fetch(request)`. `createApp()` entries are no longer supported; see https://analogjs.org/docs/features/server/custom-server.',
    );
  }
  // Connect middleware is typed with the HTTP/1 request and response.
  return toNodeHandler((request) =>
    handleRequest.call(fetchable, request),
  ) as NodeHttp1Handler;
}

function removeHtmlMiddlewares(middlewares: Connect.Server): void {
  middlewares.stack = middlewares.stack.filter(
    (layer) =>
      !HTML_MIDDLEWARES.includes(
        (layer.handle as { name?: string }).name ?? '',
      ),
  );
}
