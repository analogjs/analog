import { ViteDevServer } from 'vite';
import { EventHandler, createEvent } from 'h3';
import fg from 'fast-glob';

export async function registerDevServerMiddleware(
  root: string,
  viteServer: ViteDevServer
) {
  const middlewareFiles = fg.sync([`${root}/src/server/middleware/**/*.ts`]);

  middlewareFiles.forEach((file) => {
    viteServer.middlewares.use(async (req, res, next) => {
      const middlewareHandler: EventHandler = await viteServer
        .ssrLoadModule(file)
        .then((m: unknown) => (m as { default: EventHandler }).default);

      middlewareHandler(createEvent(req, res));
      next();
    });
  });
}
