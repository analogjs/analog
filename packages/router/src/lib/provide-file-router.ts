import {
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
  Provider,
} from '@angular/core';
import { provideRouter, RouterFeatures } from '@angular/router';

// import { routes } from './routes';
import { updateMetaTagsOnRouteChange } from './meta-tags';
// @ts-ignore
import routes from 'pages/**/*';
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
  return makeEnvironmentProviders([
    // TODO: remove type casting after Angular >=15.1.1 upgrade
    // https://github.com/angular/angular/pull/48720
    (
      provideRouter(routes, ...features) as unknown as {
        ɵproviders: Provider[];
      }
    ).ɵproviders,
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => updateMetaTagsOnRouteChange(),
    },
  ]);
}
