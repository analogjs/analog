import { InjectionToken } from '@angular/core';
import type { RouterFeatures } from '@angular/router';

export interface TypedRouterOptions {
  /** Warn when required params are missing from the active route in development. */
  strictRouteParams?: boolean;
}

export const EXPERIMENTAL_TYPED_ROUTER = new InjectionToken<TypedRouterOptions>(
  'EXPERIMENTAL_TYPED_ROUTER',
);

export function withTypedRouter(
  options: TypedRouterOptions = {},
): RouterFeatures {
  return {
    ɵkind: 102 as number,
    ɵproviders: [{ provide: EXPERIMENTAL_TYPED_ROUTER, useValue: options }],
  };
}
