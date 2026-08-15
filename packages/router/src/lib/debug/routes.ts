import { inject, InjectionToken } from '@angular/core';
import { Route } from '@angular/router';

import {
  ANALOG_CONTENT_ROUTE_FILES,
  ANALOG_ROUTE_FILES,
  ROUTE_FILES,
  createRoutes,
} from '../routes';

export const DEBUG_ROUTES = new InjectionToken(
  '@analogjs/router debug routes',
  {
    providedIn: 'root',
    factory() {
      // The glob placeholders are empty outside of Vite; esbuild builds
      // provide the same files map through withRouteFiles instead.
      const files = inject(ROUTE_FILES, { optional: true }) ?? {
        ...ANALOG_ROUTE_FILES,
        ...ANALOG_CONTENT_ROUTE_FILES,
      };
      const debugRoutes = createRoutes(files, true);

      return debugRoutes as (Route & DebugRoute)[];
    },
  },
);

export type DebugRoute = {
  path: string;
  filename: string;
  isLayout: boolean;
  children?: DebugRoute[];
};

export function injectDebugRoutes() {
  return inject(DEBUG_ROUTES);
}
