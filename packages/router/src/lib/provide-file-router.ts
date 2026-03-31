import { EnvironmentProviders } from '@angular/core';
import { RouterFeatures } from '@angular/router';

import { provideFileRouterWithRoutes } from './provide-file-router-base';

/**
 * Sets up providers for the Angular router, and registers
 * file-based routes. Additional features can be provided
 * to further configure the behavior of the router.
 *
 * @param features
 * @returns Providers and features to configure the router with routes
 */
export function provideFileRouter(
  ...features: RouterFeatures[]
): EnvironmentProviders {
  return provideFileRouterWithRoutes(...features);
}

export { withExtraRoutes } from './provide-file-router-base';
