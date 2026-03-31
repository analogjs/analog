import { ROUTES, type RouterFeatures } from '@angular/router';

import {
  createContentRoutes,
  ANALOG_CONTENT_ROUTE_FILES,
  type Files,
} from './routes';

const contentRoutes = createContentRoutes(ANALOG_CONTENT_ROUTE_FILES as Files);

export function withContentRoutes(): RouterFeatures {
  return {
    ɵkind: 101 as number,
    ɵproviders: [{ provide: ROUTES, useValue: contentRoutes, multi: true }],
  };
}
