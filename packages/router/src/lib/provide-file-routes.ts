import { provideRouter, RouterFeatures } from '@angular/router';
import { routes } from './routes';

/**
 * Sets up providers for the Angular router, and registers
 * file-based routes. Additional features can be provided
 * to further configure the behavior of the router.
 *
 * @param features
 * @returns Providers and features to configure the router with routes
 */
export const provideFileRouter = (...features: RouterFeatures[]) => {
  return provideRouter(routes, ...features);
};
