import { resolve } from 'node:path';
import { ServerResponse } from 'node:http';
import { Connect, Plugin, ViteDevServer } from 'vite';

import { EmitFileResult } from './models.js';

const ANGULAR_COMPONENT_PREFIX = '/@ng/component';
const FILE_PREFIX = 'file:';

export function liveReloadPlugin({
  classNames,
  fileEmitter,
}: {
  classNames: Map<string, string>;
  fileEmitter: (file: string) => EmitFileResult | undefined;
}): Plugin {
  return {
    name: 'analogjs-live-reload-plugin',
    configureServer(server: ViteDevServer) {
      const angularComponentMiddleware: Connect.HandleFunction = async (
        req: Connect.IncomingMessage,
        res: ServerResponse<Connect.IncomingMessage>,
        next: Connect.NextFunction,
      ) => {
        if (req.url === undefined || res.writableEnded) {
          return;
        }

        if (!req.url.includes(ANGULAR_COMPONENT_PREFIX)) {
          next();

          return;
        }

        const requestUrl = new URL(req.url, 'http://localhost');
        const componentId = requestUrl.searchParams.get('c');

        if (!componentId) {
          res.statusCode = 400;
          res.end();

          return;
        }

        const [fileId] = decodeURIComponent(componentId).split('@');
        const resolvedId = resolve(process.cwd(), fileId);
        const invalidated =
          !!server.moduleGraph.getModuleById(resolvedId)
            ?.lastInvalidationTimestamp && classNames.get(resolvedId);

        // don't send an HMR update until the file has been invalidated
        if (!invalidated) {
          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end('');
          return;
        }

        const result = fileEmitter(resolvedId);
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(`${result?.hmrUpdateCode || ''}`);
      };

      server.middlewares.use(angularComponentMiddleware);
    },
    resolveId(id, _importer, options) {
      if (
        options?.ssr &&
        id.startsWith(FILE_PREFIX) &&
        id.includes(ANGULAR_COMPONENT_PREFIX)
      ) {
        return `\0${id}`;
      }

      return undefined;
    },
    load(id, options) {
      if (options?.ssr && id.includes(ANGULAR_COMPONENT_PREFIX)) {
        const requestUrl = new URL(id.slice(1), 'http://localhost');
        const componentId = requestUrl.searchParams.get('c');

        if (!componentId) {
          return;
        }

        const result = fileEmitter(
          resolve(process.cwd(), decodeURIComponent(componentId).split('@')[0]),
        );

        return result?.hmrUpdateCode || '';
      }

      return;
    },
  };
}
