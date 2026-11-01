import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';
import {
  normalizePath,
  type Connect,
  type Plugin,
  type ViteDevServer,
} from 'vite';

import type { AnalogNodeApp } from '../router-server/analog-handler';

// The router's placeholder, as emitted after its type assertion is stripped.
const MANIFEST_PLACEHOLDER = /ANALOG_SERVER_MANIFEST = \{\}/;
const VITE_SERVER = Symbol.for('analog.node.vite');
const HTML_MIDDLEWARES = [
  'viteIndexHtmlMiddleware',
  'vite404Middleware',
  'viteSpaFallbackMiddleware',
  'viteHtmlFallbackMiddleware',
];

type AnalogOptions = { apiPrefix?: string; sourceRoot?: string };
type ServerEntry = { createApp: () => Promise<AnalogNodeApp> };

export type AnalogNodeServerOptions = {
  /** Server entry. Exports `createApp()`; listens itself in production. */
  entry?: string;
  /** Directories of non-Angular server code that Vite compiles. */
  serverDirs?: string[];
};

/**
 * Would be part of @analogjs/platform (an `analog()` option or its own export).
 *
 * Builds and serves an Analog app from a Node server entry instead of Nitro:
 * the client and a single server bundle in `vite build`, and the entry's app
 * mounted as middleware in `vite dev`.
 */
export function analogNodeServer({
  entry = 'src/server/main.ts',
  serverDirs = ['src/server'],
}: AnalogNodeServerOptions = {}): Plugin {
  let root = process.cwd();
  let analogOptions: AnalogOptions = {};
  let manifestId: string | undefined;

  return {
    name: 'analog-node-server',
    config(config) {
      root = normalizePath(resolve(config.root ?? process.cwd()));
      // Analog turns Vite's own TS transform off (the Angular plugin sets
      // `oxc: false`, the platform excludes all .ts/.js) because the Angular
      // compiler emits every file in its program. Server code outside that
      // program needs Oxc, which also lowers legacy decorators and emits
      // decorator metadata from the tsconfig. Assigned rather than returned:
      // merging would keep the platform's exclude patterns.
      config.oxc = {
        include: serverDirs.map((dir) => `${root}/${dir}/**/*.ts`),
      };
      return {
        environments: {
          client: {
            build: {
              outDir: resolve(root, 'dist/client'),
              rollupOptions: { input: resolve(root, 'index.html') },
            },
          },
          ssr: {
            // Explicit: Analog's build optimizer only defines ngServerMode for
            // environments that declare a server consumer.
            consumer: 'server',
            build: {
              outDir: resolve(root, 'dist/server'),
              copyPublicDir: false,
              rollupOptions: {
                input: { main: resolve(root, entry) },
                // Flat, so every chunk finds the client at `../client`.
                output: { chunkFileNames: '[name]-[hash].js' },
              },
            },
          },
        },
        builder: {
          async buildApp(builder) {
            await builder.build(builder.environments['client']);
            await builder.build(builder.environments['ssr']);
          },
        },
      };
    },
    configResolved(config) {
      analogOptions =
        (
          config.plugins.find((p) => p.name === '@analogjs/platform-options')
            ?.api as { analogOptions?: AnalogOptions } | undefined
        )?.analogOptions ?? {};
    },
    // Fills in the router's ANALOG_SERVER_MANIFEST placeholder, as the
    // router plugin does for ANALOG_ROUTE_FILES.
    transform(code, id) {
      if (!MANIFEST_PLACEHOLDER.test(code)) {
        return undefined;
      }
      manifestId = id;
      return code.replace(
        MANIFEST_PLACEHOLDER,
        `ANALOG_SERVER_MANIFEST = ${serverManifest(root, analogOptions)}`,
      );
    },
    configureServer(server) {
      (globalThis as Record<symbol, ViteDevServer>)[VITE_SERVER] = server;
      const invalidateServerModule = (file: string) => {
        if (file.endsWith('.server.ts')) {
          const graph = server.environments['ssr'].moduleGraph;
          const mod = manifestId && graph.getModuleById(manifestId);
          if (mod) graph.invalidateModule(mod);
        }
      };
      server.watcher.on('add', invalidateServerModule);
      server.watcher.on('unlink', invalidateServerModule);

      return () => {
        removeHtmlMiddlewares(server.middlewares);
        server.middlewares.use(devMiddleware(server, resolve(root, entry)));
      };
    },
  };
}

/**
 * The manifest object literal: lazy imports of the SSR renderer, the app's
 * server config, every `*.server.ts` (so server functions register), and page
 * endpoints keyed by route.
 */
function serverManifest(root: string, options: AnalogOptions): string {
  const apiPrefix = options.apiPrefix ?? 'api';
  const src = `${root}/${options.sourceRoot ?? 'src'}`;
  const glob = (pattern: string) =>
    globSync(pattern, {
      absolute: true,
      ignore: ['**/app.config.server.ts'],
    }).map((file) => normalizePath(file));
  const appConfig = [
    `${src}/app/app.config.server.ts`,
    `${src}/app.config.server.ts`,
  ].find((file) => existsSync(file));

  const lazy = (file: string) => `() => import(${JSON.stringify(file)})`;

  return `{
  apiPrefix: ${JSON.stringify(apiPrefix)},
  render: () => import(${JSON.stringify(`${src}/main.server.ts`)}).then((m) => m.default),
  config: ${
    appConfig
      ? `() => import(${JSON.stringify(appConfig)}).then((m) => m.config)`
      : `async () => ({ providers: [] })`
  },
  serverFnModules: [${glob(`${src}/app/**/*.server.ts`).map(lazy).join(', ')}],
  pageEndpoints: {${glob(`${src}/app/pages/**/*.server.ts`)
    .map(
      (file) =>
        `${JSON.stringify(pageEndpointRoute(file, apiPrefix))}: ${lazy(file)}`,
    )
    .join(', ')}},
}`;
}

/** Same mapping as getPageHandlers in @analogjs/platform. */
function pageEndpointRoute(file: string, apiPrefix: string): string {
  const route = file
    .replace(/^(.*?)\/pages/, '/pages')
    .replace(/\.server\.ts$/, '')
    .replace(/\[\.{3}(\w+)\]/g, '**:$1')
    .replace(/\/\(([^/]+)\)/g, '/-$1-')
    .replace(/\[(\w+)\]/g, ':$1')
    .replace(/\./g, '/');
  return `/${apiPrefix}/_analog${route}`;
}

/**
 * Hands every request Vite doesn't serve to the entry's app. The app is
 * recreated when the server module graph changes (ssrLoadModule returns a new
 * module) and the previous one is closed.
 */
function devMiddleware(
  server: ViteDevServer,
  entry: string,
): Connect.NextHandleFunction {
  let current: { entry: ServerEntry; app: Promise<AnalogNodeApp> } | undefined;

  async function getApp(): Promise<AnalogNodeApp> {
    const loaded = (await server.ssrLoadModule(entry)) as ServerEntry;
    if (current?.entry !== loaded) {
      const previous = current;
      const started = performance.now();
      current = {
        entry: loaded,
        app: loaded.createApp().then((app) => {
          server.config.logger.info(
            `[analog-node] server ${previous ? 're' : ''}started in ${Math.round(performance.now() - started)}ms`,
            { timestamp: true },
          );
          return app;
        }),
      };
      void previous?.app.then(
        (app) => app.close?.(),
        () => undefined,
      );
    }
    return current.app;
  }

  return (req, res, next) => {
    getApp()
      .then((app) => app.handle(req, res, next))
      .catch((error: Error) => {
        server.ssrFixStacktrace(error);
        next(error);
      });
  };
}

function removeHtmlMiddlewares(middlewares: Connect.Server): void {
  middlewares.stack = middlewares.stack.filter(
    (layer) =>
      !HTML_MIDDLEWARES.includes(
        (layer.handle as { name?: string }).name ?? '',
      ),
  );
}
