import { InjectionToken } from '@angular/core';
import type { RouteExport } from './models';

export type Files = Record<string, () => Promise<RouteExport>>;

/**
 * This variable reference is replaced with a glob of all page routes.
 */
export const ANALOG_ROUTE_FILES = {};

export interface ExtraRouteFileSource {
  files: Record<string, () => Promise<unknown>>;
  resolveModule: (
    filename: string,
    fileLoader: () => Promise<unknown>,
  ) => () => Promise<RouteExport>;
}

export const ANALOG_EXTRA_ROUTE_FILE_SOURCES: InjectionToken<
  ExtraRouteFileSource[]
> = new InjectionToken('@analogjs/router extra route file sources');

/**
 * Replaced at build time by the Vite router plugin with the number of
 * discovered content route files. Used in dev mode to warn when content
 * files exist but `withContentRoutes()` is not configured.
 */
export const ANALOG_CONTENT_FILE_COUNT = 0;
