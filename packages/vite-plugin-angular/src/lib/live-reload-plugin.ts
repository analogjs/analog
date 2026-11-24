import { resolve } from 'node:path';
import { ServerResponse } from 'node:http';
import { Connect, normalizePath, Plugin, ViteDevServer } from 'vite';

import {
  isAngularBuildContext,
  type AngularBuildContext,
} from './angular-build-context.js';
import { EmitFileResult } from './models.js';
import { debugHmr } from './utils/debug.js';

const ANGULAR_COMPONENT_PREFIX = '/@ng/component';
const FILE_PREFIX = 'file:';

export interface ComponentUpdates {
  classNames: Map<string, Set<string>>;
  fileEmitter: (
    file: string,
    className: string,
  ) => Pick<EmitFileResult, 'hmrUpdateCode'> | undefined;
  rootDir?: string;
}

function createProxyMatchers(
  proxy: ViteDevServer['config']['server']['proxy'],
): Array<(url: string) => boolean> {
  if (!proxy) {
    return [];
  }

  const matchers: Array<(url: string) => boolean> = [];
  for (const [context, opts] of Object.entries(proxy)) {
    if (!opts) {
      continue;
    }
    // Skip proxy rules with custom bypass handlers that may route local
    // requests back to this dev server.
    if (typeof opts === 'object' && typeof opts.bypass === 'function') {
      continue;
    }
    if (context.startsWith('^')) {
      const regex = new RegExp(context);
      matchers.push((url) => regex.test(url));
    } else {
      matchers.push((url) => url.startsWith(context));
    }
  }
  return matchers;
}

export function liveReloadPlugin(
  ctxOrUpdates?: AngularBuildContext | ComponentUpdates,
): Plugin {
  const updates: ComponentUpdates = isAngularBuildContext(ctxOrUpdates)
    ? ctxOrUpdates.hmr
    : (ctxOrUpdates ?? {
        classNames: new Map<string, Set<string>>(),
        fileEmitter: () => undefined,
      });

  const resolveFileId = (fileId: string): string =>
    normalizePath(resolve(updates.rootDir ?? process.cwd(), fileId));

  return {
    name: 'analogjs-live-reload-plugin',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      if (server.config.server.hmr === false) {
        debugHmr('middleware disabled: vite server.hmr is false');
        return;
      }

      const proxyMatchers = createProxyMatchers(server.config.server.proxy);

      const angularComponentMiddleware: Connect.HandleFunction = async (
        req: Connect.IncomingMessage,
        res: ServerResponse<Connect.IncomingMessage>,
        next: Connect.NextFunction,
      ) => {
        if (req.url === undefined || res.writableEnded) {
          return;
        }

        if (
          !req.url.includes(ANGULAR_COMPONENT_PREFIX) ||
          proxyMatchers.some((match) => match(req.url!))
        ) {
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

        const [fileId, className] = decodeURIComponent(componentId).split('@');
        const resolvedId = resolveFileId(fileId);
        const moduleNode = server.moduleGraph.getModuleById(resolvedId);
        const knownClasses = updates.classNames.get(resolvedId);

        if (!moduleNode && !knownClasses?.size) {
          debugHmr('middleware: passed through (unknown component)', {
            resolvedId,
            className,
          });
          next();
          return;
        }

        const hasKnownClass = className
          ? !!knownClasses?.has(className)
          : !!knownClasses?.size;
        const invalidated =
          !!moduleNode?.lastInvalidationTimestamp && hasKnownClass;

        // don't send an HMR update until the file has been invalidated
        if (!invalidated) {
          debugHmr('middleware: skipped (not invalidated)', {
            resolvedId,
            className,
          });
          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end('');
          return;
        }

        const result = updates.fileEmitter(resolvedId, className);
        debugHmr('middleware: served component update', {
          resolvedId,
          className,
          hasCode: !!result?.hmrUpdateCode,
        });
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

        const [fileId, className] = decodeURIComponent(componentId).split('@');
        const result = updates.fileEmitter(resolveFileId(fileId), className);

        return result?.hmrUpdateCode || '';
      }

      return;
    },
  };
}
