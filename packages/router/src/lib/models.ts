import { Type } from '@angular/core';

import { defineRouteMeta } from './define-route';

export type RouteExport = {
  default: Type<unknown>;
  routeMeta?: ReturnType<typeof defineRouteMeta>;
};
