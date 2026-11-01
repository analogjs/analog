import type { INestApplication } from '@nestjs/common';
import { resolve } from 'node:path';
import type { Connect, Plugin, ViteDevServer } from 'vite';

const VITE_SERVER = Symbol.for('analog.nest.vite');
const HTML_MIDDLEWARES = [
  'viteIndexHtmlMiddleware',
  'vite404Middleware',
  'viteSpaFallbackMiddleware',
  'viteHtmlFallbackMiddleware',
];

type NestEntry = { createNestApp: () => Promise<INestApplication> };

export function analogNest({ entry = 'src/server/main.ts' } = {}): Plugin {
  let root = process.cwd();

  return {
    name: 'analog-nest',
    config(config) {
      root = resolve(config.root ?? process.cwd());
      // Analog turns Vite's own TS transform off (the Angular plugin sets
      // `oxc: false`, the platform excludes all .ts/.js) because the Angular
      // compiler emits every file in its program. Nest files outside that
      // program need Oxc, which lowers legacy decorators and emits decorator
      // metadata from the tsconfig. Assigned rather than returned: merging
      // would keep the platform's exclude patterns.
      config.oxc = { include: [/\/src\/(server|analog-nest)\/.*\.ts$/] };
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
              rollupOptions: { input: { main: resolve(root, entry) } },
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
    configureServer(server) {
      (globalThis as Record<symbol, ViteDevServer>)[VITE_SERVER] = server;
      return () => {
        removeHtmlMiddlewares(server.middlewares);
        server.middlewares.use(nestDevMiddleware(server, resolve(root, entry)));
      };
    },
  };
}

/**
 * Hands every request Vite doesn't serve to the Nest app. The app is rebuilt
 * when the server module graph changes (ssrLoadModule returns a new module).
 */
function nestDevMiddleware(
  server: ViteDevServer,
  entry: string,
): Connect.NextHandleFunction {
  let current: { entry: NestEntry; app: Promise<INestApplication> } | undefined;

  async function getApp(): Promise<INestApplication> {
    const loaded = (await server.ssrLoadModule(entry)) as NestEntry;
    if (current?.entry !== loaded) {
      const previous = current;
      const started = performance.now();
      current = {
        entry: loaded,
        app: loaded.createNestApp().then((app) => {
          server.config.logger.info(
            `[analog-nest] Nest app ${previous ? 're' : ''}started in ${Math.round(performance.now() - started)}ms`,
            { timestamp: true },
          );
          return app;
        }),
      };
      void previous?.app.then(
        (app) => app.close(),
        () => undefined,
      );
    }
    return current.app;
  }

  return (req, res, next) => {
    getApp()
      .then((app) => app.getHttpAdapter().getInstance()(req, res, next))
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
