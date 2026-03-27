import { EnvironmentProviders } from '@angular/core';
import { RouterFeatures } from '@angular/router';

import {
  provideFileRouterWithRoutes,
  withExtraRoutes,
} from '../../../src/lib/provide-file-router-base';
import { routes } from './routes';

export function provideFileRouter(
  ...features: RouterFeatures[]
): EnvironmentProviders {
  return provideFileRouterWithRoutes(routes, ...features);
}

export { withExtraRoutes } from '../../../src/lib/provide-file-router-base';
