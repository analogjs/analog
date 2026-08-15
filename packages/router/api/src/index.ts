import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createApp,
  createRouter,
  defineLazyEventHandler,
  toNodeListener,
} from 'h3';
import { createRouter as createMatcher } from 'radix3';

export type ApiRouteFiles = Record<string, () => Promise<{ default: unknown }>>;

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
  const routes = apiRoutesFromFiles(files);
  const router = createRouter();
  const matcher = createMatcher();

  for (const { route, method, filename } of routes) {
    const handler = defineLazyEventHandler(async () => {
      const module = await files[filename]();
      return module.default as never;
    });

    if (method) {
      router.add(route, handler, method.toLowerCase() as never);
    } else {
      router.use(route, handler);
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
