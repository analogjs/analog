import { Pipe, PipeTransform } from '@angular/core';

import type { AnalogRoutePath, RoutePathOptionsBase } from './route-path';
import { buildUrl } from './route-path';

/**
 * Angular pipe that builds a URL from a typed route path.
 *
 * Use with Angular's `[routerLink]` to get type-safe route building
 * in templates. The path provides autocomplete when the route table
 * is augmented by generated code.
 *
 * @example
 * ```html
 * <!-- Static route -->
 * <a [routerLink]="'/about' | routeLink">About</a>
 *
 * <!-- Dynamic route -->
 * <a [routerLink]="'/users/[id]' | routeLink:{ params: { id: userId } }">
 *   User Profile
 * </a>
 *
 * <!-- With query params -->
 * <a [routerLink]="'/users/[id]' | routeLink:{
 *   params: { id: userId },
 *   query: { tab: 'settings' }
 * }">Settings</a>
 *
 * <!-- Catch-all -->
 * <a [routerLink]="'/docs/[...slug]' | routeLink:{
 *   params: { slug: ['api', 'auth'] }
 * }">API Auth Docs</a>
 * ```
 */
@Pipe({
  name: 'routeLink',
  standalone: true,
})
export class RouteLinkPipe implements PipeTransform {
  transform(path: AnalogRoutePath, options?: RoutePathOptionsBase): string {
    return buildUrl(path as string, options);
  }
}
