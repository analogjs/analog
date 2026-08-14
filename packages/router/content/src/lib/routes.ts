import type { Route } from '@angular/router';

import type { RouteExport } from '../../../src/lib/models';
import { createRoutes as createBaseRoutes } from '../../../src/lib/route-builder';
import { toMarkdownModule } from './markdown-helpers';

/**
 * This variable reference is replaced with a glob of all content routes.
 */
export const ANALOG_CONTENT_ROUTE_FILES = {};

export type Files = Record<string, () => Promise<RouteExport | string>>;

export function createContentRoutes(files: Files, debug = false): Route[] {
  return createBaseRoutes(
    files,
    (filename, fileLoader) =>
      filename.endsWith('.md')
        ? toMarkdownModule(fileLoader as () => Promise<string>)
        : (fileLoader as () => Promise<RouteExport>),
    debug,
  );
}
