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
