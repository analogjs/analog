import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import {
  apiRoutesDir,
  createApiRoutesModule,
  discoverApiRoutes,
} from './analog-api-plugin.js';
import {
  createPageEndpointsModule,
  discoverPageEndpoints,
} from './analog-page-endpoints-plugin.js';

interface ApiRoutesHandler {
  matches(pathname: string): boolean;
  handler(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

/**
 * Dev-server middleware serving `src/server/routes` handlers and
 * `.server.ts` page endpoints during `ng serve`, where the app's server
 * entry does not run. Handlers are bundled on demand with esbuild
 * (packages external, so h3 resolves from the workspace) and rebuilt
 * whenever the discovered file set or any handler's mtime changes.
 */
export function createAnalogApiMiddleware(
  workspaceRoot: string,
  projectRoot: string,
): (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void {
  const root = projectRoot.replace(/\\/g, '/');
  const outDir = `${workspaceRoot}/node_modules/@analogjs/esbuild-manifests/dev-api`;
  const workspaceRequire = createRequire(`${workspaceRoot}/noop.js`);

  let cacheKey = '';
  let cached: ApiRoutesHandler[] | undefined;
  let generation = 0;

  const loadHandlers = async (): Promise<ApiRoutesHandler[]> => {
    const apiFiles = discoverApiRoutes(root);
    const endpointFiles = discoverPageEndpoints(root, workspaceRoot);
    const files = [...apiFiles, ...endpointFiles];
    if (files.length === 0) {
      return [];
    }

    const key = files
      .map((file) => `${file}:${statSync(file).mtimeMs}`)
      .join('|');
    if (cached && key === cacheKey) {
      return cached;
    }

    const buildRequire = createRequire(
      realpathSync(workspaceRequire.resolve('@angular/build/package.json')),
    );
    const esbuild: typeof import('esbuild') = buildRequire('esbuild');

    mkdirSync(outDir, { recursive: true });
    const entryFile = `${outDir}/entry.mjs`;
    const bundleFile = `${outDir}/api-routes.mjs`;
    writeFileSync(
      entryFile,
      `export const apiRoutes = ${moduleObject(
        createApiRoutesModule(apiFiles, root),
      )};\n` +
        `export const pageEndpoints = ${moduleObject(
          createPageEndpointsModule(endpointFiles, root, false),
        )};\n`,
    );

    await esbuild.build({
      entryPoints: [entryFile],
      bundle: true,
      format: 'esm',
      platform: 'node',
      packages: 'external',
      outfile: bundleFile,
      logLevel: 'silent',
    });

    const routerApiUrl = pathToFileURL(
      workspaceRequire.resolve('@analogjs/router/api'),
    ).href;
    const { createApiRoutesHandler, createPageEndpointsHandler } =
      (await import(routerApiUrl)) as {
        createApiRoutesHandler: (files: unknown) => ApiRoutesHandler;
        createPageEndpointsHandler: (files: unknown) => ApiRoutesHandler;
      };

    generation += 1;
    const bundleUrl = `${pathToFileURL(bundleFile).href}?v=${generation}`;
    const { apiRoutes, pageEndpoints } = await import(bundleUrl);

    cached = [
      createApiRoutesHandler(apiRoutes),
      createPageEndpointsHandler(pageEndpoints),
    ];
    cacheKey = key;
    return cached;
  };

  return (req, res, next) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

    void (async () => {
      try {
        for (const api of await loadHandlers()) {
          if (api.matches(pathname)) {
            await api.handler(req, res);
            return;
          }
        }
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

/**
 * The module factories emit `export default {...};` sources; reuse them
 * as object literals inside the combined dev entry.
 */
function moduleObject(moduleSource: string): string {
  return moduleSource.replace(/^export default /, '').replace(/;\s*$/, '');
}
