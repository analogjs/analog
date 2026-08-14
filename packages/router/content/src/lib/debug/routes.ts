import { inject, InjectionToken } from '@angular/core';
import { Route } from '@angular/router';

import { ANALOG_CONTENT_ROUTE_FILES, createContentRoutes } from '../routes';

export const DEBUG_CONTENT_ROUTES: InjectionToken<(Route & DebugRoute)[]> =
  new InjectionToken<(Route & DebugRoute)[]>(
    '@analogjs/router/content debug routes',
    {
      providedIn: 'root',
      factory() {
        const debugRoutes = createContentRoutes(
          ANALOG_CONTENT_ROUTE_FILES as Record<string, () => Promise<string>>,
          true,
        );

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

export function injectDebugContentRoutes(): (Route & DebugRoute)[] {
  return inject(DEBUG_CONTENT_ROUTES);
}
