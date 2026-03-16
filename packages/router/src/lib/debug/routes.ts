import { inject, InjectionToken } from '@angular/core';
import { Route } from '@angular/router';

import {
  ANALOG_CONTENT_ROUTE_FILES,
  ANALOG_ROUTE_FILES,
  createRoutes,
} from '../routes';

export const DEBUG_ROUTES: InjectionToken<(Route & DebugRoute)[]> =
  new InjectionToken<(Route & DebugRoute)[]>('@analogjs/router debug routes', {
    providedIn: 'root',
    factory() {
      const debugRoutes = createRoutes(
        {
          ...ANALOG_ROUTE_FILES,
          ...ANALOG_CONTENT_ROUTE_FILES,
        },
        true,
      );

      return debugRoutes as (Route & DebugRoute)[];
    },
  });

export type DebugRoute = {
  path: string;
  filename: string;
  isLayout: boolean;
  children?: DebugRoute[];
};

export function injectDebugRoutes(): (Route & DebugRoute)[] {
  return inject(DEBUG_ROUTES);
}
