import { ActivatedRouteSnapshot } from '@angular/router';

/**
 * Get server load resolver data for the route
 *
 * @param route Provides the route to get server load resolver
 * @returns Returns server load resolver data for the route
 */
export async function getLoadResolver<T>(
  route: ActivatedRouteSnapshot
): Promise<T> {
  return route.routeConfig?.resolve?.['load']?.(route);
}
