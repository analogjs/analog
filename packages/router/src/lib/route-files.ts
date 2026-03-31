import type { RouteExport } from './models';

export type Files = Record<string, () => Promise<RouteExport>>;

/**
 * This variable reference is replaced with a glob of all page routes.
 */
export const ANALOG_ROUTE_FILES = {};
