import { ViteDevServer } from 'vite';
import { EventHandler, mockEvent } from 'h3';
import fg from 'fast-glob';

export async function registerDevServerMiddleware(
  root: string,
  sourceRoot: string,
  viteServer: ViteDevServer,
) {
  const middlewareFiles = fg.sync([
    `${root}/${sourceRoot}/server/middleware/**/*.ts`,
  ]);

  middlewareFiles.forEach((file) => {
    viteServer.middlewares.use(async (req, res, next) => {
      const middlewareHandler: EventHandler = await viteServer
        .ssrLoadModule(file)
        .then((m: unknown) => (m as { default: EventHandler }).default);

      // Skip middleware for now as mockEvent doesn't work with IncomingMessage
      // const result = await middlewareHandler(mockEvent(req));
      next();
    });
  });
}
