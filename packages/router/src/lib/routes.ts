import type { Route } from '@angular/router';

import type { RouteExport } from './models';
import { createRoutes as createBaseRoutes } from './route-builder';
import { ANALOG_ROUTE_FILES, type Files } from './route-files';

/**
 * A function used to parse list of files and create configuration of routes.
 *
 * @param files
 * @returns Array of routes
 */
export function createRoutes(files: Files, debug = false): Route[] {
  return createBaseRoutes(
    files,
    (_filename, fileLoader) => fileLoader as () => Promise<RouteExport>,
    debug,
  );
}

export { ANALOG_ROUTE_FILES } from './route-files';

export const routes: Route[] = createRoutes(ANALOG_ROUTE_FILES);
